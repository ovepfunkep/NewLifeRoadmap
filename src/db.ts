import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Node, ImportStrategy } from './types';
import { generateTutorial } from './utils/tutorialData';

function log(...args: any[]) {
  console.log('[DB]', ...args);
}

interface LifeRoadmapDB extends DBSchema {
  nodes: {
    key: string;
    value: Node;
  };
}

const DB_NAME = 'LifeRoadmapDB';
const DB_VERSION = 2; // Увеличиваем версию для пересоздания store с keyPath
const STORE_NAME = 'nodes';
const ROOT_ID = 'root-node';

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
    },
  });
  
  log('DB initialized');
  
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
  const buildTree = (node: Node): Node => {
    const children = (childrenMap.get(node.id) || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    return {
      ...node,
      children: children.map(c => buildTree(c))
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

// Сохранить узел (только плоскую структуру)
export async function saveNode(node: Node): Promise<void> {
  if (!dbInstance) await initDB();
  log(`Saving node: ${node.id} (${node.title})`);
  
  // Используем дату из объекта, если она есть, иначе создаем новую
  const updatedAt = node.updatedAt || new Date().toISOString();
  
  // КЛОНИРУЕМ узел и ОЧИЩАЕМ его от детей перед сохранением в БД.
  const { children, ...nodeToSave } = node;
  const flatNode: Node = {
    ...nodeToSave,
    children: [], // В БД дети всегда должны быть пустыми
    updatedAt,
  };
  
  await dbInstance!.put(STORE_NAME, flatNode);
  log(`Node saved flat: ${node.id}, updatedAt: ${updatedAt}`);
  
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

// Удалить узел и всех потомков (soft-delete)
export async function deleteNode(id: string): Promise<void> {
  if (!dbInstance) await initDB();
  
  log(`Deleting node: ${id}`);
  if (id === ROOT_ID) {
    log('Root node deletion is blocked');
    return;
  }

  // Находим все узлы, чтобы найти потомков (так как в БД нет иерархии)
  const allNodes = await dbInstance!.getAll(STORE_NAME);
  const deletedAt = new Date().toISOString();
  
  const idsToDelete = new Set<string>();
  const collectIds = (targetId: string) => {
    idsToDelete.add(targetId);
    allNodes.filter(n => n.parentId === targetId).forEach(child => collectIds(child.id));
  };
  
  collectIds(id);
  log(`Marking ${idsToDelete.size} nodes as deleted`);

  const tx = dbInstance!.transaction(STORE_NAME, 'readwrite');
  for (const nodeId of idsToDelete) {
    const n = allNodes.find(item => item.id === nodeId);
    if (n) {
      await tx.store.put({
        ...n,
        children: [],
        deletedAt,
        updatedAt: deletedAt
      });
    }
  }
  await tx.done;

  // Обновляем родителя (только его updatedAt)
  const node = allNodes.find(n => n.id === id);
  if (node && node.parentId) {
    const parent = allNodes.find(n => n.id === node.parentId);
    if (parent) {
      await dbInstance!.put(STORE_NAME, {
        ...parent,
        children: [],
        updatedAt: deletedAt
      });
    }
  }
}

// Вспомогательная функция для перегенерации ID
function remapIds(node: Node, existingIds: Set<string>): Node {
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newId = existingIds.has(node.id) ? generateId() : node.id;
  existingIds.add(newId);
  
  return {
    ...node,
    id: newId,
    children: node.children.map(child => remapIds(child, existingIds)),
  };
}

// Массовый импорт
export async function bulkImport(
  parentId: string,
  payload: Node,
  strategy: ImportStrategy
): Promise<void> {
  if (!dbInstance) await initDB();
  
  const parent = await getNode(parentId);
  if (!parent) {
    throw new Error(`Parent node ${parentId} not found`);
  }
  
  // Собираем все существующие ID в поддереве родителя
  const existingIds = new Set<string>();
  const collectIds = (node: Node) => {
    existingIds.add(node.id);
    node.children.forEach(collectIds);
  };
  parent.children.forEach(collectIds);
  
  // Перегенерируем ID при конфликтах
  const remappedPayload = remapIds(payload, existingIds);
  remappedPayload.parentId = parentId;
  
  // Обновляем parentId у всех потомков
  const updateParentIds = (node: Node, newParentId: string) => {
    node.parentId = newParentId;
    node.children.forEach(child => updateParentIds(child, node.id));
  };
  updateParentIds(remappedPayload, parentId);
  
  // Сохраняем всё поддерево
  const saveSubtree = async (n: Node) => {
    const { children, ...rest } = n;
    const nodeToSave = {
      ...rest,
      children: [], // В БД всегда пустые дети
      updatedAt: new Date().toISOString(),
    };
    await dbInstance!.put(STORE_NAME, nodeToSave);
    if (children) {
      for (const child of children) {
        await saveSubtree(child);
      }
    }
  };
  await saveSubtree(remappedPayload);
  
  // Обновляем родителя
  let updatedChildren: Node[];
  if (strategy === 'replace') {
    updatedChildren = [remappedPayload];
  } else {
    updatedChildren = [...parent.children, remappedPayload];
  }
  
  const updatedParent: Node = {
    ...parent,
    children: updatedChildren,
    updatedAt: new Date().toISOString(),
  };
  await saveNode(updatedParent);
}

