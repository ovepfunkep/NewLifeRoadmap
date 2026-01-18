import { collection, doc, getDoc, setDoc, getDocs, query, writeBatch } from 'firebase/firestore';
import { getFirebaseDB } from './config';
import { getCurrentUser } from './auth';
import { Node } from '../types';
import { getActiveSyncKey } from '../utils/securityManager';
import { encryptData, decryptData } from '../utils/crypto';

function log(..._args: any[]) {
  // Debug logging disabled
}

/**
 * Получить путь к коллекции узлов пользователя
 */
function getUserNodesPath(userId: string): string {
  return `users/${userId}/nodes`;
}

/**
 * Очистить объект от undefined значений для Firestore
 * Firestore не принимает undefined, заменяем на null или удаляем
 */
function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // Пропускаем undefined поля - Firestore их не поддерживает
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned as T;
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
    // Сохраняем узел без детей (дети хранятся отдельно)
    const { children, ...nodeData } = node;
    
    log(`Encrypting title and description for node ${node.id}`);
    const encryptedTitle = await encryptData(node.title, syncKey);
    let encryptedDescription = node.description;
    if (node.description) {
      encryptedDescription = await encryptData(node.description, syncKey);
    }
    
    const dataToSave = {
      ...nodeData,
      title: encryptedTitle,
      description: encryptedDescription,
      isFieldsEncrypted: true, // Новый флаг для шифрования полей
      syncedAt: new Date().toISOString(),
    };

    // Очищаем от undefined значений перед сохранением
    const cleanedData = cleanForFirestore(dataToSave);
    await setDoc(nodeRef, cleanedData);
    log(`Node synced successfully: ${node.id}`);
  } catch (error) {
    log(`Error syncing node ${node.id}:`, error);
    console.error('Error syncing node to Firestore:', error);
    throw error;
  }
}

/**
 * Сохранить все узлы в Firestore (первая синхронизация)
 */
export async function syncAllNodesToFirestore(allNodes: Node[]): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, skipping sync');
    return;
  }

  const syncKey = getActiveSyncKey();
  const db = getFirebaseDB();

  if (!syncKey) {
    log('Sync key not found for bulk sync, skipping to prevent plaintext leak');
    return;
  }

  try {
    log(`Starting bulk sync: ${allNodes.length} nodes`);
    
    // Загружаем все существующие узлы из Firestore
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const querySnapshot = await getDocs(query(nodesRef));
    
    const cloudNodeIds = new Set<string>();
    const nodesToPurge: string[] = [];
    const now = Date.now();
    const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
    
    querySnapshot.forEach((docSnap) => {
      cloudNodeIds.add(docSnap.id);
      const data = docSnap.data() as Partial<Node>;
      if (data.deletedAt) {
        const deletedTime = new Date(data.deletedAt).getTime();
        if (Number.isFinite(deletedTime) && now - deletedTime > PURGE_AFTER_MS) {
          nodesToPurge.push(docSnap.id);
        }
      }
    });
    
    log(`Cloud nodes: ${cloudNodeIds.size}, Local nodes: ${allNodes.length}`);
    log(`Found ${nodesToPurge.length} nodes to purge (deleted > 30 days)`);
    
    // Firestore batch ограничен 500 операциями
    const BATCH_LIMIT = 500;
    
    // СНАЧАЛА очищаем старые tombstone-узлы
    if (nodesToPurge.length > 0) {
      for (let i = 0; i < nodesToPurge.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const batchToDelete = nodesToPurge.slice(i, i + BATCH_LIMIT);
        
        for (const nodeId of batchToDelete) {
          const nodeRef = doc(nodesRef, nodeId);
          batch.delete(nodeRef);
        }
        
        await batch.commit();
        log(`Purge batch ${Math.floor(i / BATCH_LIMIT) + 1} completed: ${batchToDelete.length} nodes deleted`);
      }
    }
    
    // ЗАТЕМ сохраняем все новые узлы батчами
    if (allNodes.length > 0) {
      for (let i = 0; i < allNodes.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const batchToSave = allNodes.slice(i, i + BATCH_LIMIT);
        
        for (const node of batchToSave) {
          const { children, ...nodeData } = node;
          const nodeRef = doc(nodesRef, node.id);
          
          const encryptedTitle = await encryptData(node.title, syncKey);
          let encryptedDescription = node.description;
          if (node.description) {
            encryptedDescription = await encryptData(node.description, syncKey);
          }

          const dataToSave = {
            ...nodeData,
            title: encryptedTitle,
            description: encryptedDescription,
            isFieldsEncrypted: true,
            syncedAt: new Date().toISOString(),
          };

          // Очищаем от undefined значений перед сохранением
          const cleanedData = cleanForFirestore(dataToSave);
          batch.set(nodeRef, cleanedData);
        }
        
        await batch.commit();
        log(`Save batch ${Math.floor(i / BATCH_LIMIT) + 1} completed: ${batchToSave.length} nodes saved`);
      }
    }
    
    log(`Bulk sync completed: ${allNodes.length} nodes synced, ${nodesToPurge.length} purged`);
  } catch (error) {
    log(`Error in bulk sync:`, error);
    console.error('Error syncing all nodes to Firestore:', error);
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
    return {
      ...data,
      children: [], // Дети будут загружены отдельно
    } as unknown as Node;
  } catch (error) {
    console.error('Error loading node from Firestore:', error);
    return null;
  }
}

/**
 * Загрузить все узлы из Firestore
 */
export async function loadAllNodesFromFirestore(): Promise<Node[]> {
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
    log('Loading all nodes from Firestore');
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const querySnapshot = await getDocs(nodesRef);
    
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
        completed: data.completed ?? false,
        completedAt: data.completedAt ?? null,
        priority: data.priority,
        order: data.order,
        createdAt: data.createdAt ?? data.updatedAt ?? new Date(0).toISOString(),
        updatedAt: data.updatedAt ?? data.createdAt ?? new Date(0).toISOString(),
        deletedAt: data.deletedAt ?? null,
        reminders: data.reminders,
        sentReminders: data.sentReminders,
        children: [],
      };

      return normalized;
    });

    const nodes = await Promise.all(nodePromises);

    if (decryptionFailedCount > 0) {
      console.warn(`[Sync] Failed to decrypt ${decryptionFailedCount} nodes. This is normal if you changed your security key recently.`);
    }

    log(`Loaded ${nodes.length} nodes from Firestore`);

    // Восстанавливаем иерархию (дети) только для активных узлов
    const nodeMap = new Map<string, Node>();
    const deletedNodes: Node[] = [];
    nodes.forEach(node => {
      if (node.deletedAt) {
        deletedNodes.push({ ...node, children: [] });
      } else {
        nodeMap.set(node.id, { ...node, children: [] });
      }
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
    // Возвращаем все узлы (не только корневые)
    return [...Array.from(nodeMap.values()), ...deletedNodes];
  } catch (error) {
    log(`Error loading nodes:`, error);
    console.error('Error loading all nodes from Firestore:', error);
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
    const batch = writeBatch(db);
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const deletedAt = new Date().toISOString();
    
    const markDeleted = (id: string) => {
      const nodeRef = doc(nodesRef, id);
      batch.set(nodeRef, { deletedAt, updatedAt: deletedAt, syncedAt: deletedAt }, { merge: true });
    };
    
    markDeleted(nodeId);
    for (const childId of childrenIds) {
      markDeleted(childId);
    }
    
    await batch.commit();
  } catch (error) {
    console.error('Error soft-deleting node from Firestore:', error);
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
    const querySnapshot = await getDocs(query(nodesRef));
    const hasData = !querySnapshot.empty;
    log(`Firestore has data: ${hasData} (${querySnapshot.size} documents)`);
    return hasData;
  } catch (error) {
    log(`Error checking Firestore data:`, error);
    console.error('Error checking Firestore data:', error);
    return false;
  }
}

