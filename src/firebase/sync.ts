import { collection, doc, getDoc, setDoc, getDocs, query, writeBatch, getDocsFromServer, where, limit, onSnapshot, orderBy, Unsubscribe, type DocumentData, type Firestore } from 'firebase/firestore';
import { getFirebaseDB } from './config';
import { getCurrentUser } from './auth';
import { Node } from '../types';
import { getActiveSyncKey } from '../utils/securityManager';
import { encryptData, decryptData } from '../utils/crypto';
import { computeNextReminderAt } from '../utils';
import { isCloudAccessFailure, reportCloudFirestoreFailure, reportCloudFirestoreSuccess } from '../utils/cloudFirestoreHealth';
import { clearLocalCloudPushPending, markLocalCloudPushPending } from '../utils/localCloudPushPending';

/**
 * Firestore sync: encrypt node writes, decrypt/normalize reads, change-log paging,
 * bulk sync helpers, and `onSnapshot` subscriptions. Payloads use `DocumentData`;
 * app model is `Node` from `../types` after `normalizeNodeFromPayload`.
 */
export type SyncChangeLogRow = { id: string } & DocumentData;

function log(..._args: unknown[]) {
  // console.log('[FirebaseSync]', ..._args);
}

/**
 * Промис с таймаутом для предотвращения бесконечного ожидания Firebase SDK при Quota Exceeded
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT_SYNC: ${operationName} took too long (> ${timeoutMs}ms)`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

const BATCH_COMMIT_TIMEOUT = 10000; // 10 секунд на один батч

/**
 * Получить путь к метаданным синхронизации пользователя
 */
function getUserSyncMetaPath(userId: string): string {
  // Используем подколлекцию security, для которой уже настроены правила доступа
  return `users/${userId}/security/sync_meta`;
}

/**
 * Получить путь к change log пользователя
 */
function getUserChangesPath(userId: string): string {
  // Переносим изменения в основную коллекцию security, так как на подколлекции правила не распространяются
  return `users/${userId}/security`;
}

/**
 * Локальный clientId для фильтрации собственных изменений
 */
export function getClientId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'client_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  localStorage.setItem(key, created);
  return created;
}

async function encryptNodeFields(node: Node, syncKey: string): Promise<Record<string, unknown>> {
  const { children, deletedAt: _omitDeletedAt, ...nodeData } = node;
  const encryptedTitle = await encryptData(node.title, syncKey);
  let encryptedDescription = node.description;
  if (node.description) {
    encryptedDescription = await encryptData(node.description, syncKey);
  }

  const updatedAt = node.updatedAt || new Date().toISOString();

  return cleanForFirestore({
    ...nodeData,
    updatedAt,
    title: encryptedTitle,
    description: encryptedDescription,
    isFieldsEncrypted: true,
    syncedAt: new Date().toISOString(),
  });
}

async function decryptNodeFields(data: DocumentData, syncKey: string | null): Promise<DocumentData> {
  if (!syncKey) return data;
  let result = { ...data };
  if (result.isEncrypted && result.encryptedData) {
    try {
      const decrypted = await decryptData(result.encryptedData, syncKey);
      result = { ...result, ...decrypted };
    } catch (e) {}
  } else if (result.isTitleEncrypted) {
    try {
      const decryptedTitle = await decryptData(result.title, syncKey);
      result.title = decryptedTitle;
    } catch (e) {}
  } else if (result.isFieldsEncrypted) {
    try {
      const decryptedTitle = await decryptData(result.title, syncKey);
      result.title = decryptedTitle;
      if (result.description) {
        const decryptedDesc = await decryptData(result.description, syncKey);
        result.description = decryptedDesc;
      }
    } catch (e) {}
  }
  return result;
}

export async function normalizeNodeFromPayload(payload: DocumentData, nodeIdOverride?: string): Promise<Node> {
  const syncKey = getActiveSyncKey();
  const data = await decryptNodeFields(payload, syncKey);
  const id = data.id || nodeIdOverride || '';
  return {
    id,
    parentId: data.parentId ?? null,
    title: data.title ?? '',
    description: data.description,
    deadline: data.deadline ?? null,
    deadlineEnd: data.deadlineEnd ?? null,
    isRecurring: data.isRecurring ?? false,
    recurrence: data.recurrence ?? null,
    completed: data.completed ?? false,
    completedAt: data.completedAt ?? null,
    priority: data.priority,
    order: data.order,
    createdAt: data.createdAt ?? data.updatedAt ?? new Date(0).toISOString(),
    updatedAt: data.updatedAt ?? data.createdAt ?? new Date(0).toISOString(),
    deletedAt: data.deletedAt ?? null,
    reminders: data.reminders,
    sentReminders: data.sentReminders,
    nextReminderAt: data.nextReminderAt ?? null,
    children: [],
  };
}

async function writeChangeLog(payload: Record<string, unknown>, userId: string, type: 'node' | 'bulk'): Promise<void> {
  const db = getFirebaseDB();
  const changesRef = collection(db, getUserChangesPath(userId));
  const changeDoc = doc(changesRef);
  const clientId = getClientId();
  const updatedAt = payload.updatedAt || new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await setDoc(changeDoc, cleanForFirestore({
    type,
    nodeId: payload.id,
    updatedAt,
    payload,
    updatedBy: clientId,
    expiresAt,
  }));
}

/** Пострановая выборка журнала (getDocs) — не держит тяжёлый live-query на весь хвост. */
export async function fetchChangeLogSincePage(
  userId: string,
  sinceExclusive: string,
  pageSize: number
): Promise<SyncChangeLogRow[]> {
  const db = getFirebaseDB();
  const changesRef = collection(db, getUserChangesPath(userId));
  const q = query(
    changesRef,
    where('updatedAt', '>', sinceExclusive),
    orderBy('updatedAt', 'asc'),
    limit(pageSize)
  );
  try {
    const snapshot = await withTimeout(getDocs(q), 15000, 'fetchChangeLogSincePage');
    const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    reportCloudFirestoreSuccess();
    return rows;
  } catch (e) {
    reportCloudFirestoreFailure(e);
    throw e;
  }
}

export function subscribeToChangeLog(
  userId: string,
  since: string | null,
  onChange: (changes: SyncChangeLogRow[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const db = getFirebaseDB();
  const changesRef = collection(db, getUserChangesPath(userId));
  const q = since
    ? query(changesRef, where('updatedAt', '>', since), orderBy('updatedAt', 'asc'))
    : query(changesRef, orderBy('updatedAt', 'asc'));

  let firstSnapshot = true;
  return onSnapshot(q, (snapshot) => {
    if (firstSnapshot) {
      firstSnapshot = false;
      reportCloudFirestoreSuccess();
    }
    const added = snapshot.docChanges()
      .filter(change => change.type === 'added')
      .map(change => ({ id: change.doc.id, ...change.doc.data() }));
    if (added.length > 0) onChange(added);
  }, (error) => {
    reportCloudFirestoreFailure(error);
    if (onError) onError(error);
  });
}

/** Удаляет до maxBatch просроченных записей журнала; возвращает число удалённых документов. */
export async function cleanupChangeLog(userId: string, maxBatch = 300): Promise<number> {
  const db = getFirebaseDB();
  const changesRef = collection(db, getUserChangesPath(userId));
  const nowIso = new Date().toISOString();
  const q = query(changesRef, where('expiresAt', '<', nowIso), orderBy('expiresAt', 'asc'), limit(maxBatch));
  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;
    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    reportCloudFirestoreSuccess();
    return snapshot.size;
  } catch (e) {
    reportCloudFirestoreFailure(e);
    return 0;
  }
}

/**
 * Получить метаданные синхронизации из Firestore
 */
export async function getSyncMeta(): Promise<{ lastChangedAt: string } | null> {
  const user = getCurrentUser();
  if (!user) return null;
  
  const db = getFirebaseDB();
  try {
    const metaRef = doc(db, getUserSyncMetaPath(user.uid));
    const metaSnap = await getDoc(metaRef);
    reportCloudFirestoreSuccess();
    if (metaSnap.exists()) {
      return metaSnap.data() as { lastChangedAt: string };
    }
    return null;
  } catch (error) {
    console.error('Error getting sync meta:', error);
    reportCloudFirestoreFailure(error);
    return null;
  }
}

/**
 * Обновить метаданные синхронизации в Firestore
 */
export async function updateSyncMeta(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;
  
  const db = getFirebaseDB();
  try {
    const metaRef = doc(db, getUserSyncMetaPath(user.uid));
    const clientId = getClientId();
    await setDoc(metaRef, { 
      lastChangedAt: new Date().toISOString(),
      updatedBy: clientId 
    }, { merge: true });
    reportCloudFirestoreSuccess();
  } catch (error) {
    console.error('Error updating sync meta:', error);
    reportCloudFirestoreFailure(error);
  }
}

/**
 * Получить путь к коллекции узлов пользователя
 */
function getUserNodesPath(userId: string): string {
  return `users/${userId}/nodes`;
}

const ROOT_NODE_ID = 'root-node';

/** Документы в Firestore, которых нет в локальном наборе (сверка по doc.id и полю id). */
async function listServerOrphanDocIds(
  db: Firestore,
  userId: string,
  localIdSet: Set<string>,
): Promise<string[]> {
  const nodesRef = collection(db, getUserNodesPath(userId));
  const snap = await withTimeout(getDocsFromServer(nodesRef), 15000, 'listServerOrphanDocIds');
  const orphanDocIds: string[] = [];
  for (const docSnap of snap.docs) {
    if (docSnap.id === ROOT_NODE_ID) continue;
    const data = docSnap.data() as DocumentData;
    const logicalId = String(data.id ?? docSnap.id);
    if (localIdSet.has(docSnap.id) || localIdSet.has(logicalId)) continue;
    orphanDocIds.push(docSnap.id);
  }
  return orphanDocIds;
}

/** Физическое удаление документов узлов батчами (лимит Firestore 500 операций). */
async function commitBatchedNodeDocDeletes(db: Firestore, userId: string, ids: string[]): Promise<void> {
  const uniq = [...new Set(ids.filter((id) => id && id !== ROOT_NODE_ID))];
  if (uniq.length === 0) return;
  log(`Hard-deleting ${uniq.length} node document(s) from Firestore`);
  const nodesRef = collection(db, getUserNodesPath(userId));
  const BATCH_LIMIT = 500;
  for (let i = 0; i < uniq.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of uniq.slice(i, i + BATCH_LIMIT)) {
      batch.delete(doc(nodesRef, id));
    }
    await withTimeout(
      batch.commit(),
      BATCH_COMMIT_TIMEOUT,
      `delete nodes batch ${Math.floor(i / BATCH_LIMIT) + 1}`,
    );
  }
}

/**
 * Очистить объект от undefined значений для Firestore
 * Firestore не принимает undefined, заменяем на null или удаляем
 */
function cleanForFirestore<T extends Record<string, unknown>>(obj: T): T {
  const cleanValue = (value: unknown): unknown => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) {
      return value
        .map((item) => cleanValue(item))
        .filter((item) => item !== undefined);
    }
    if (typeof value === 'object') {
      const nested: Record<string, unknown> = {};
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        const cleanedNestedValue = cleanValue(nestedValue);
        if (cleanedNestedValue !== undefined) {
          nested[nestedKey] = cleanedNestedValue;
        }
      }
      return nested;
    }
    return value;
  };

  const cleaned = cleanValue(obj);
  if (cleaned && typeof cleaned === 'object') {
    return cleaned as T;
  }
  return {} as T;
}

/**
 * Сохранить узел в Firestore
 */
export async function syncNodeToFirestore(node: Node): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, skipping sync');
    return;
  }

  const syncKey = getActiveSyncKey();
  const db = getFirebaseDB();

  // Если пользователь залогинен, мы ОБЯЗАТЕЛЬНО должны иметь ключ для шифрования.
  // Если ключа нет, значит система еще не инициализирована, и синхронизировать нельзя,
  // чтобы не отправить открытые данные.
  if (!syncKey) {
    log('Sync key not found for authenticated user, skipping sync to prevent plaintext leak');
    return;
  }

  try {
    log(`Syncing node to Firestore: ${node.id} (${node.title})`);
    const nodeRef = doc(db, getUserNodesPath(user.uid), node.id);
    const nodeWithReminder = { ...node, nextReminderAt: computeNextReminderAt(node) };
    const cleanedData = await encryptNodeFields(nodeWithReminder, syncKey);
    await setDoc(nodeRef, cleanedData);
    await writeChangeLog(cleanedData, user.uid, 'node');
    await updateSyncMeta();
    log(`Node synced successfully: ${node.id}`);
    reportCloudFirestoreSuccess();
  } catch (error) {
    log(`Error syncing node ${node.id}:`, error);
    console.error('Error syncing node to Firestore:', error);
    reportCloudFirestoreFailure(error);
    throw error;
  }
}

export type SyncAllNodesOptions = {
  /** Удалить из Firestore документы, которых нет в allNodes (после «оставить локальные»). */
  purgeCloudOrphans?: boolean;
  /** Записать все локальные узлы, не только с более новым updatedAt. */
  overwriteAll?: boolean;
};

/**
 * Сохранить все узлы в Firestore (первая синхронизация или массовое обновление)
 */
export async function syncAllNodesToFirestore(
  allNodes: Node[],
  cloudNodes?: Node[],
  options?: SyncAllNodesOptions,
): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, skipping sync');
    throw new Error('SYNC_NOT_AUTHENTICATED');
  }

  const syncKey = getActiveSyncKey();
  const db = getFirebaseDB();

  if (!syncKey) {
    log('Sync key not found for bulk sync, skipping to prevent plaintext leak');
    throw new Error('SYNC_KEY_MISSING');
  }

  try {
    log(`Starting bulk sync: ${allNodes.length} nodes`);
    
    let cloudMap = new Map<string, any>();
    const nodesToPurge: string[] = [];

    if (cloudNodes) {
      log('Using provided cloud nodes for diff check');
      const alive: Node[] = [];
      const legacyTombIds: string[] = [];
      for (const n of cloudNodes) {
        if (n.deletedAt) legacyTombIds.push(n.id);
        else alive.push(n);
      }
      cloudMap = new Map(alive.map((n) => [n.id, n]));
      if (legacyTombIds.length > 0) {
        await commitBatchedNodeDocDeletes(db, user.uid, legacyTombIds);
      }
    } else {
      log('Fetching all nodes from Firestore for diff check (expensive)');
      // Загружаем все существующие узлы из Firestore только если они не переданы
      const nodesRef = collection(db, getUserNodesPath(user.uid));
      const querySnapshot = await withTimeout(getDocs(query(nodesRef)), 15000, 'syncAllNodes:getDocs');

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as DocumentData;
        if (data.deletedAt) {
          nodesToPurge.push(docSnap.id);
        } else {
          cloudMap.set(docSnap.id, data);
        }
      });
    }
    
    log(`Cloud nodes: ${cloudMap.size}, Local nodes: ${allNodes.length}`);

    const localIdSet = new Set(allNodes.map((n) => n.id));
    let orphansPurged = 0;

    if (options?.purgeCloudOrphans) {
      const orphanDocIds = await listServerOrphanDocIds(db, user.uid, localIdSet);
      if (orphanDocIds.length > 0) {
        await commitBatchedNodeDocDeletes(db, user.uid, orphanDocIds);
        orphansPurged = orphanDocIds.length;
        log(`Purged ${orphanDocIds.length} cloud orphan document(s) not present locally`);
      }
      const remainingOrphans = await listServerOrphanDocIds(db, user.uid, localIdSet);
      if (remainingOrphans.length > 0) {
        throw new Error(`ORPHAN_PURGE_INCOMPLETE:${remainingOrphans.length}`);
      }
      const serverSnap = await withTimeout(
        getDocsFromServer(collection(db, getUserNodesPath(user.uid))),
        15000,
        'purgeOrphans:rebuildCloudMap',
      );
      cloudMap.clear();
      serverSnap.forEach((docSnap) => {
        const data = docSnap.data() as DocumentData;
        if (!data.deletedAt) cloudMap.set(docSnap.id, data);
      });
    }

    // Firestore batch ограничен 500 операциями
    const BATCH_LIMIT = 500;
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    
    // Сначала убираем устаревшие документы с deletedAt (раньше soft-delete)
    if (nodesToPurge.length > 0) {
      await commitBatchedNodeDocDeletes(db, user.uid, nodesToPurge);
      log(`Removed ${nodesToPurge.length} legacy tombstone document(s) from Firestore`);
    }
    
    const nodesToSave = options?.overwriteAll
      ? allNodes
      : allNodes.filter((local) => {
          const cloud = cloudMap.get(local.id);
          if (!cloud) return true;

          const localTime = new Date(local.updatedAt || 0).getTime();
          const cloudTime = new Date(cloud.updatedAt || 0).getTime();

          return localTime > cloudTime;
        });

    log(
      `Nodes to save: ${nodesToSave.length} (overwriteAll=${!!options?.overwriteAll}, skipped ${allNodes.length - nodesToSave.length})`,
    );

    if (nodesToSave.length > 0) {
      for (let i = 0; i < nodesToSave.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const chunk = nodesToSave.slice(i, i + BATCH_LIMIT);
        
        await Promise.all(chunk.map(async (node) => {
          const nodeRef = doc(nodesRef, node.id);
          const nodeWithReminder = { ...node, nextReminderAt: computeNextReminderAt(node) };
          const dataToSave = await encryptNodeFields(nodeWithReminder, syncKey);
          batch.set(nodeRef, dataToSave);
        }));
        
        await withTimeout(batch.commit(), BATCH_COMMIT_TIMEOUT, `Sync Batch ${Math.floor(i / BATCH_LIMIT) + 1}`);
        log(`Save batch ${Math.floor(i / BATCH_LIMIT) + 1} completed: ${chunk.length} nodes saved`);
      }
    }
    
    if (nodesToSave.length > 0 || orphansPurged > 0) {
      await writeChangeLog({ id: 'bulk', updatedAt: new Date().toISOString(), fullSyncRequired: true }, user.uid, 'bulk');
    }
    await updateSyncMeta();
    log(
      `Bulk sync completed: ${nodesToSave.length} saved, ${nodesToPurge.length} tombstones purged, ${orphansPurged} orphans purged`,
    );
    clearLocalCloudPushPending();
    reportCloudFirestoreSuccess();
  } catch (error) {
    log(`Error in bulk sync:`, error);
    console.error('Error syncing all nodes to Firestore:', error);
    reportCloudFirestoreFailure(error);
    if (isCloudAccessFailure(error)) {
      markLocalCloudPushPending();
    }
    throw error;
  }
}

/**
 * Загрузить узел из Firestore
 */
export async function loadNodeFromFirestore(nodeId: string): Promise<Node | null> {
  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  const syncKey = getActiveSyncKey();
  const db = getFirebaseDB();

  try {
    const nodeRef = doc(db, getUserNodesPath(user.uid), nodeId);
    const nodeSnap = await getDoc(nodeRef);
    
    if (!nodeSnap.exists()) {
      reportCloudFirestoreSuccess();
      return null;
    }

    let data = nodeSnap.data();
    
    // Поддержка всех форматов: старого (полное), промежуточного (только заголовок) и нового (поля)
    if (data.isEncrypted && data.encryptedData && syncKey) {
      try {
        const decrypted = await decryptData(data.encryptedData, syncKey);
        data = { ...data, ...decrypted };
      } catch (e) {
        console.error(`Failed to decrypt node ${nodeId}`, e);
      }
    } else if (data.isTitleEncrypted && syncKey) {
      try {
        const decryptedTitle = await decryptData(data.title, syncKey);
        data.title = decryptedTitle;
      } catch (e) {
        console.error(`Failed to decrypt title for node ${nodeId}`, e);
      }
    } else if (data.isFieldsEncrypted && syncKey) {
      try {
        const decryptedTitle = await decryptData(data.title, syncKey);
        data.title = decryptedTitle;
        if (data.description) {
          const decryptedDesc = await decryptData(data.description, syncKey);
          data.description = decryptedDesc;
        }
      } catch (e) {
        console.error(`Failed to decrypt fields for node ${nodeId}`, e);
      }
    }

    // Восстанавливаем структуру Node (дети загружаются отдельно)
    reportCloudFirestoreSuccess();
    return {
      ...data,
      children: [], // Дети будут загружены отдельно
    } as unknown as Node;
  } catch (error) {
    console.error('Error loading node from Firestore:', error);
    reportCloudFirestoreFailure(error);
    return null;
  }
}

/**
 * Загрузить только измененные узлы из Firestore
 */
export async function loadChangedNodesFromFirestore(since: string): Promise<Node[]> {
  const user = getCurrentUser();
  if (!user) return [];

  const db = getFirebaseDB();
  if (!db) return [];

  try {
    log(`Loading changed nodes since ${since}`);
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const q = query(nodesRef, where("updatedAt", ">", since));
    const querySnapshot = await withTimeout(getDocsFromServer(q), 15000, 'loadChangedNodesFromFirestore');
    
    const nodePromises = querySnapshot.docs.map(async (docSnap) => {
      return normalizeNodeFromPayload(docSnap.data(), docSnap.id);
    });

    const nodes = await Promise.all(nodePromises);
    const tombIds = nodes.filter((n) => n.deletedAt).map((n) => n.id);
    if (tombIds.length > 0) {
      await commitBatchedNodeDocDeletes(db, user.uid, tombIds);
    }
    const active = nodes.filter((n) => !n.deletedAt);
    log(`Loaded ${active.length} changed nodes from Firestore`);
    reportCloudFirestoreSuccess();
    return active;
  } catch (error) {
    console.error('Error loading changed nodes from Firestore:', error);
    reportCloudFirestoreFailure(error);
    return [];
  }
}

/**
 * Загрузить все узлы из Firestore
 */
export async function loadAllNodesFromFirestore(forceServer = false): Promise<Node[]> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, cannot load nodes');
    return [];
  }

  const syncKey = getActiveSyncKey();
  const db = getFirebaseDB();
  if (!db) {
    log('Firebase DB not initialized');
    return [];
  }

  try {
    log(`Loading all nodes from Firestore (forceServer: ${forceServer})`);
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const getDocsPromise = forceServer ? getDocsFromServer(nodesRef) : getDocs(nodesRef);
    const querySnapshot = await withTimeout(getDocsPromise, 15000, 'loadAllNodesFromFirestore');
    
    let decryptionFailedCount = 0;
    
    // Оптимизация: дешифруем всё параллельно через Promise.all
    const nodePromises = querySnapshot.docs.map(async (docSnap) => {
      let data = docSnap.data();
      
      if (data.isEncrypted && data.encryptedData && syncKey) {
        try {
          const decrypted = await decryptData(data.encryptedData, syncKey);
          data = { ...data, ...decrypted };
        } catch (e) {
          decryptionFailedCount++;
        }
      } else if (data.isTitleEncrypted && syncKey) {
        try {
          const decryptedTitle = await decryptData(data.title, syncKey);
          data.title = decryptedTitle;
        } catch (e) {
          decryptionFailedCount++;
        }
      } else if (data.isFieldsEncrypted && syncKey) {
        try {
          const decryptedTitle = await decryptData(data.title, syncKey);
          data.title = decryptedTitle;
          if (data.description) {
            const decryptedDesc = await decryptData(data.description, syncKey);
            data.description = decryptedDesc;
          }
        } catch (e) {
          decryptionFailedCount++;
        }
      }

      const normalized: Node = {
        id: data.id || docSnap.id,
        parentId: data.parentId ?? null,
        title: data.title ?? '',
        description: data.description,
        deadline: data.deadline ?? null,
        deadlineEnd: data.deadlineEnd ?? null,
        isRecurring: data.isRecurring ?? false,
        recurrence: data.recurrence ?? null,
        completed: data.completed ?? false,
        completedAt: data.completedAt ?? null,
        priority: data.priority,
        order: data.order,
        createdAt: data.createdAt ?? data.updatedAt ?? new Date(0).toISOString(),
        updatedAt: data.updatedAt ?? data.createdAt ?? new Date(0).toISOString(),
        deletedAt: data.deletedAt ?? null,
        reminders: data.reminders,
        sentReminders: data.sentReminders,
        nextReminderAt: data.nextReminderAt ?? null,
        children: [],
      };

      return normalized;
    });

    const nodes = await Promise.all(nodePromises);

    if (decryptionFailedCount > 0) {
      console.warn(`[Sync] Failed to decrypt ${decryptionFailedCount} nodes. This is normal if you changed your security key recently.`);
    }

    const tombstoneIds = nodes.filter((n) => n.deletedAt).map((n) => n.id);
    if (tombstoneIds.length > 0) {
      await commitBatchedNodeDocDeletes(db, user.uid, tombstoneIds);
    }
    const activeNodes = nodes.filter((n) => !n.deletedAt);
    log(
      `Loaded ${activeNodes.length} active nodes from Firestore (${tombstoneIds.length} legacy tombstone document(s) removed)`,
    );

    // Восстанавливаем иерархию (дети) только для активных узлов
    const nodeMap = new Map<string, Node>();
    activeNodes.forEach((node) => {
      nodeMap.set(node.id, { ...node, children: [] });
    });

    // Связываем детей с родителями
    const rootNodes: Node[] = [];
    Array.from(nodeMap.values()).forEach(node => {
      const nodeWithChildren = nodeMap.get(node.id)!;
      
      // Исправляем корневой узел: если это root-node, parentId должен быть null
      if (nodeWithChildren.id === 'root-node') {
        nodeWithChildren.parentId = null;
      }
      
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(nodeWithChildren);
      } else {
        // Это корневой узел
        rootNodes.push(nodeWithChildren);
      }
    });

    // Сортируем детей по order
    const sortChildren = (node: Node) => {
      if (node.children) {
        node.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        node.children.forEach(sortChildren);
      }
    };
    rootNodes.forEach(sortChildren);

    log(`Restored hierarchy: ${rootNodes.length} root nodes`);
    reportCloudFirestoreSuccess();
    return Array.from(nodeMap.values());
  } catch (error) {
    log(`Error loading nodes:`, error);
    console.error('Error loading all nodes from Firestore:', error);
    reportCloudFirestoreFailure(error);
    return [];
  }
}

/**
 * Удалить узел из Firestore (рекурсивно удаляет всех детей)
 */
export async function deleteNodeFromFirestore(nodeId: string, childrenIds: string[] = []): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    console.warn('User not authenticated, skipping delete');
    return;
  }

  const db = getFirebaseDB();

  try {
    await commitBatchedNodeDocDeletes(db, user.uid, [nodeId, ...childrenIds]);
    reportCloudFirestoreSuccess();
  } catch (error) {
    console.error('Error deleting node from Firestore:', error);
    reportCloudFirestoreFailure(error);
    throw error;
  }
}

/**
 * Проверить, есть ли данные в Firestore
 */
export async function hasDataInFirestore(): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, no data in Firestore');
    return false;
  }

  const db = getFirebaseDB();

  try {
    log('Checking if data exists in Firestore');
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const q = query(nodesRef, limit(1));
    const querySnapshot = await withTimeout(getDocs(q), 10000, 'hasDataInFirestore');
    const hasData = !querySnapshot.empty;
    log(`Firestore has data: ${hasData}`);
    reportCloudFirestoreSuccess();
    return hasData;
  } catch (error) {
    log(`Error checking Firestore data:`, error);
    console.error('Error checking Firestore data:', error);
    reportCloudFirestoreFailure(error);
    return false;
  }
}

