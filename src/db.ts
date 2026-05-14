import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Node, ImportStrategy } from './types';
import { generateTutorial } from './utils/tutorialData';

function log(..._args: any[]) {
  // console.log('[DB]', ..._args);
}

interface LifeRoadmapDB extends DBSchema {
  nodes: {
    key: string;
    value: Node;
  };
  weeklyBackupFallback: {
    key: string;
    value: { key: string; body: string };
  };
}

const DB_NAME = 'LifeRoadmapDB';
const DB_VERSION = 3; // + weeklyBackupFallback для OPFS-fallback
const STORE_NAME = 'nodes';
const WEEKLY_BACKUP_FALLBACK_STORE = 'weeklyBackupFallback';
/** Публичный id корня (совпадает с ROOT_ID). */
export const ROOT_NODE_ID = 'root-node';
const ROOT_ID = ROOT_NODE_ID;

let dbInstance: IDBPDatabase<LifeRoadmapDB> | null = null;

// Инициализация БД
export async function initDB(): Promise<void> {
  if (dbInstance) {
    log('DB already initialized');
    return;
  }
  
  log('Initializing DB');
  dbInstance = await openDB<LifeRoadmapDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      log(`DB upgrade from version ${oldVersion} to ${DB_VERSION}`);
      // Если версия < 2, удаляем старый store (он был без keyPath)
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      // Создаём store с keyPath для автоматического использования id как ключа
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        log('Created object store');
      }
      if (!db.objectStoreNames.contains(WEEKLY_BACKUP_FALLBACK_STORE)) {
        db.createObjectStore(WEEKLY_BACKUP_FALLBACK_STORE, { keyPath: 'key' });
      }
    },
  });
  
  log('DB initialized');
  
  // Проверяем и исправляем возможные циклы (например, если узел является своим родителем)
  const allNodes = await dbInstance.getAll(STORE_NAME);
  let fixedCount = 0;
  for (const node of allNodes) {
    if (node.parentId === node.id) {
      log(`Fixing cycle: node ${node.id} was its own parent. Resetting parentId to ROOT_ID.`);
      node.parentId = (node.id === ROOT_ID) ? null : ROOT_ID;
      await dbInstance.put(STORE_NAME, node);
      fixedCount++;
    }
  }
  if (fixedCount > 0) log(`Fixed ${fixedCount} cyclical nodes`);

  // Создаём корневой узел, если его нет
  const existingRoot = await dbInstance.get(STORE_NAME, ROOT_ID);
  if (!existingRoot) {
    log('Root node not found, creating...');
    const now = new Date().toISOString();
    const rootNode: Node = {
      id: ROOT_ID,
      parentId: null,
      title: 'Ваши Life Roadmaps',
      completed: false,
      createdAt: now,
      updatedAt: now,
      children: [],
    };
    await dbInstance.put(STORE_NAME, rootNode);
    log('Root node created');
    await injectTutorialIfEmpty();
  } else {
    log('Root node already exists');
    await injectTutorialIfEmpty();
  }

  await purgeLegacySoftDeletedFromStore();
}

/** Удаляет записи с deletedAt после перехода на жёсткое удаление в IndexedDB. */
async function purgeLegacySoftDeletedFromStore(): Promise<void> {
  if (!dbInstance) return;
  const allNodes = await dbInstance.getAll(STORE_NAME);
  const doomed = allNodes.filter((n) => n.id !== ROOT_ID && n.deletedAt);
  if (doomed.length === 0) return;
  log(`Removing ${doomed.length} legacy soft-deleted rows from IndexedDB`);
  const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
  for (const n of doomed) {
    await tx.store.delete(n.id);
  }
  await tx.done;
}

async function injectTutorialIfEmpty(): Promise<void> {
  if (!dbInstance) return;

  const allNodes = await dbInstance.getAll(STORE_NAME);
  const root = allNodes.find(n => n.id === ROOT_ID);

  // Only inject on "first visit": DB has only root (or root with no children).
  const isEmpty = allNodes.length <= 1 || (root && root.children.length === 0 && allNodes.length <= 2);
  if (!isEmpty || !root) return;

  log('Injecting tutorial (first visit)...');

  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  const ru = generateTutorial('ru', isMobile);
  const en = generateTutorial('en', isMobile);
  const tutorialRoots = [...ru, ...en];

  const saveSubtree = async (node: Node) => {
    const { children, ...rest } = node;
    await dbInstance!.put(STORE_NAME, { ...rest, children: [] });
    if (children) {
      for (const child of children) await saveSubtree(child);
    }
  };
  for (const node of tutorialRoots) await saveSubtree(node);

  const updatedRoot: Node = {
    ...root,
    children: [], // В БД всегда пустые
    updatedAt: new Date().toISOString(),
  };
  await dbInstance.put(STORE_NAME, updatedRoot);
  log('Tutorial injected');
}

// Recreate tutorial in root (for footer button). No protection: creates a new copy each time.
export async function recreateTutorial(): Promise<void> {
  if (!dbInstance) await initDB();

  const root = await getRoot();
  
  // Проверка на дубликаты: если узел с таким типом уже есть в корне, не создаем новый
  if (root.children.some(c => c.id.endsWith('-refresh-memory'))) {
    throw new Error('DUPLICATE_TUTORIAL');
  }

  const currentLang = (typeof window !== 'undefined' && localStorage.getItem('language')) || 'en';
  const isRu = currentLang === 'ru';
  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

  const ru = generateTutorial('ru', isMobile);
  const en = generateTutorial('en', isMobile);

  const now = new Date().toISOString();
  const wrapper: Node = {
    id: `${Date.now()}-refresh-memory`,
    parentId: ROOT_ID,
    title: isRu ? 'Освежим память?' : 'Refresh memory?',
    description: isRu
      ? 'Повторим основы? Выбери язык и пройди туториал заново.'
      : 'Refresh the basics? Pick a language and replay the tutorial.',
    completed: false,
    createdAt: now,
    updatedAt: now,
    children: [...ru, ...en],
  };

  const saveSubtree = async (node: Node) => {
    const { children, ...rest } = node;
    await dbInstance!.put(STORE_NAME, { ...rest, children: [] });
    if (children) {
      for (const child of children) await saveSubtree(child);
    }
  };
  await saveSubtree(wrapper);

  const updatedRoot: Node = {
    ...root,
    children: [], // В БД корень тоже без детей
    updatedAt: new Date().toISOString(),
  };
  await dbInstance!.put(STORE_NAME, updatedRoot);
}

// Получить корневой узел
export async function getRoot(): Promise<Node> {
  if (!dbInstance) await initDB();
  const node = await getNode(ROOT_ID);
  if (!node) {
    throw new Error('Root node not found');
  }
  return node;
}

// Получить узел по ID со всей иерархией потомков
export async function getNode(id: string): Promise<Node | null> {
  if (!dbInstance) await initDB();
  
  const allNodes = await dbInstance!.getAll(STORE_NAME);
  const rawNode = allNodes.find(n => n.id === id);
  
  if (!rawNode) return null;

  // Индексируем узлы по parentId для быстрого построения дерева
  const childrenMap = new Map<string, Node[]>();
  allNodes.forEach(node => {
    if (node.parentId && !node.deletedAt) {
      if (!childrenMap.has(node.parentId)) {
        childrenMap.set(node.parentId, []);
      }
      childrenMap.get(node.parentId)!.push(node);
    }
  });

  // Рекурсивно собираем дерево
  const buildTree = (node: Node, visited: Set<string> = new Set()): Node => {
    if (visited.has(node.id)) {
      log(`Cycle detected at node ${node.id}, breaking it.`);
      return { ...node, children: [] };
    }
    visited.add(node.id);
    
    const children = (childrenMap.get(node.id) || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    return {
      ...node,
      children: children.map(c => buildTree(c, new Set(visited)))
    };
  };

  return buildTree(rawNode);
}

// Получить все узлы из БД в плоском виде (для синхронизации)
export async function getAllNodesFlat(): Promise<Node[]> {
  if (!dbInstance) await initDB();
  const nodes = await dbInstance!.getAll(STORE_NAME);
  return nodes.map(n => ({ ...n, children: [] }));
}

// Получить все узлы из БД и восстановить иерархию
export async function getAllNodes(): Promise<Node[]> {
  if (!dbInstance) await initDB();
  const nodes = await dbInstance!.getAll(STORE_NAME);
  
  const nodeMap = new Map<string, Node>();
  nodes.forEach(node => {
    // Исправляем корневой узел
    if (node.id === ROOT_ID && node.parentId !== null) {
      node.parentId = null;
    }
    nodeMap.set(node.id, { ...node, children: [] });
  });

  // Связываем детей с родителями (только для активных узлов)
  nodes.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      const current = nodeMap.get(node.id)!;
      if (!node.deletedAt) {
        if (!parent.children.some(c => c.id === node.id)) {
          parent.children.push(current);
        }
      }
    }
  });

  // Сортируем детей
  nodeMap.forEach(node => {
    node.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });

  log(`Retrieved and reconstructed ${nodes.length} nodes from DB`);
  return Array.from(nodeMap.values());
}

// Очистить все узлы из БД (кроме корневого)
export async function clearAllNodes(): Promise<void> {
  if (!dbInstance) await initDB();
  log('Clearing all nodes from DB');
  const allNodes = await dbInstance!.getAll(STORE_NAME);
  const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
  for (const node of allNodes) {
    if (node.id !== ROOT_ID) {
      await tx.store.delete(node.id);
    }
  }
  await tx.done;
  log('All nodes cleared (except root)');
}

const WEEKLY_FALLBACK_ROW_KEY = 'weeklyPayload';

/** Fallback, если OPFS недоступен: один JSON в отдельном store. */
export async function saveWeeklyBackupFallbackBody(body: string): Promise<void> {
  if (!dbInstance) await initDB();
  await dbInstance!.put(WEEKLY_BACKUP_FALLBACK_STORE, { key: WEEKLY_FALLBACK_ROW_KEY, body });
}

export async function loadWeeklyBackupFallbackBody(): Promise<string | null> {
  if (!dbInstance) await initDB();
  const row = await dbInstance!.get(WEEKLY_BACKUP_FALLBACK_STORE, WEEKLY_FALLBACK_ROW_KEY);
  return row?.body ?? null;
}

export async function clearWeeklyBackupFallbackBody(): Promise<void> {
  if (!dbInstance) await initDB();
  try {
    await dbInstance!.delete(WEEKLY_BACKUP_FALLBACK_STORE, WEEKLY_FALLBACK_ROW_KEY);
  } catch {
    // ignore
  }
}

/** Полная замена дерева из плоского бэкапа (локальный weekly restore). */
export async function restoreFromWeeklyBackupFlat(nodes: Node[]): Promise<void> {
  if (!dbInstance) await initDB();
  if (!nodes.some((n) => n.id === ROOT_ID)) {
    throw new Error('BACKUP_MISSING_ROOT');
  }
  const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
  const keys = await tx.store.getAllKeys();
  for (const k of keys) {
    if (k !== ROOT_ID) await tx.store.delete(k);
  }
  for (const raw of nodes) {
    const { children: _c, deletedAt: _d, ...rest } = raw;
    let flat: Node = { ...rest, children: [] };
    if (flat.id === ROOT_ID) {
      flat = { ...flat, parentId: null };
    }
    await tx.store.put(flat);
  }
  await tx.done;
}

// Сохранить узел (только плоскую структуру)
export async function saveNode(node: Node): Promise<void> {
  if (!dbInstance) await initDB();
  log(`Saving node: ${node.id} (${node.title})`);
  
  // Используем дату из объекта, если она есть, иначе создаем новую
  const updatedAt = node.updatedAt || new Date().toISOString();
  
  // КЛОНИРУЕМ узел и ОЧИЩАЕМ его от детей перед сохранением в БД. deletedAt не сохраняем (жёсткое удаление).
  const { children, deletedAt: _removedDeletedAt, ...nodeToSave } = node;
  const flatNode: Node = {
    ...nodeToSave,
    children: [], // В БД дети всегда должны быть пустыми
    updatedAt,
  };
  
  await dbInstance!.put(STORE_NAME, flatNode);
  
  // Если у узла в памяти были дети, сохраняем их как отдельные плоские записи
  if (children && children.length > 0) {
    for (const child of children) {
      await saveNode(child);
    }
  }
  
  // Обновляем родительский узел (только если это не системный вызов сохранения из синхронизации)
  // Мы проверяем parentId и то, что узел не является корнем
  if (node.parentId && node.id !== ROOT_ID) {
    const parent = await dbInstance!.get(STORE_NAME, node.parentId);
    if (parent) {
      await dbInstance!.put(STORE_NAME, {
        ...parent,
        updatedAt: new Date().toISOString()
      });
    }
  }
}

// Удалить узел и всех потомков (жёсткое удаление записей из IndexedDB)
export async function deleteNode(id: string): Promise<void> {
  if (!dbInstance) await initDB();
  
  log(`Deleting node: ${id}`);
  if (id === ROOT_ID) {
    log('Root node deletion is blocked');
    return;
  }

  const allNodes = await dbInstance!.getAll(STORE_NAME);
  const now = new Date().toISOString();
  
  const idsToDelete = new Set<string>();
  const collectIds = (targetId: string) => {
    idsToDelete.add(targetId);
    allNodes.filter(n => n.parentId === targetId).forEach(child => collectIds(child.id));
  };
  
  collectIds(id);
  log(`Hard-deleting ${idsToDelete.size} nodes from IndexedDB`);

  const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
  for (const nodeId of idsToDelete) {
    if (nodeId === ROOT_ID) continue;
    await tx.store.delete(nodeId);
  }
  await tx.done;

  const node = allNodes.find(n => n.id === id);
  if (node && node.parentId) {
    const parent = allNodes.find(n => n.id === node.parentId);
    if (parent) {
      await dbInstance!.put(STORE_NAME, {
        ...parent,
        children: [],
        updatedAt: now
      });
    }
  }
}

// Вспомогательная функция для перегенерации ID
function remapIds(node: Node, existingIds: Set<string>, newParentId: string | null = null, visited: Set<Node> = new Set()): Node {
  if (visited.has(node)) {
    return { ...node, children: [] };
  }
  visited.add(node);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const isDuplicate = node.id === ROOT_ID ? false : existingIds.has(node.id);
  const newId = (node.id === ROOT_ID) ? ROOT_ID : (isDuplicate ? generateId() : node.id);
  existingIds.add(newId);
  
  const remappedNode: Node = {
    ...node,
    id: newId,
    parentId: newParentId,
    children: [], // Будут заполнены ниже рекурсивно
  };

  if (node.children && node.children.length > 0) {
    remappedNode.children = node.children.map(child => remapIds(child, existingIds, newId, visited));
  }

  return remappedNode;
}

// Массовый импорт
export async function bulkImport(
  parentId: string,
  payload: Node,
  strategy: ImportStrategy
): Promise<void> {
  if (!dbInstance) await initDB();
  
  // Собираем все существующие узлы для анализа
  const allNodes = await dbInstance!.getAll(STORE_NAME);
  
  // Если стратегия "заменить", помечаем текущих детей как удаленные
  if (strategy === 'replace') {
    log(`Replacing children of ${parentId}`);
    // Ищем всех детей, у которых parentId совпадает с целевым, и они не удалены
    const childrenToDelete = allNodes.filter(n => n.parentId === parentId && !n.deletedAt);
    for (const child of childrenToDelete) {
      await deleteNode(child.id);
    }
  }

  // Обновляем список ID после удаления, чтобы remapIds видел актуальную картину
  const allNodesAfterDelete = await dbInstance!.getAll(STORE_NAME);
  const existingIds = new Set(allNodesAfterDelete.map(n => n.id));

  // Если мы импортируем узел, ID которого совпадает с целевым родителем (например, импорт корня в корень),
  // то мы импортируем только его детей, чтобы не создавать цикл.
  if (payload.id === parentId) {
    log(`Importing payload with same ID as parent (${parentId}). Importing children directly.`);
    if (payload.children && payload.children.length > 0) {
      for (const child of payload.children) {
        const remappedChild = remapIds(child, existingIds, parentId);
        await saveNode(remappedChild);
      }
    }
  } else {
    // Обычный импорт: узел становится ребенком родителя
    const remappedPayload = remapIds(payload, existingIds, parentId);
    await saveNode(remappedPayload);
  }

  // Обновляем дату родителя (обязательно через put, чтобы не пересобирать дерево)
  const parentRecord = allNodes.find(n => n.id === parentId);
  if (parentRecord) {
    await dbInstance!.put(STORE_NAME, {
      ...parentRecord,
      children: [], // В БД всегда пустые
      updatedAt: new Date().toISOString()
    });
  }
}

