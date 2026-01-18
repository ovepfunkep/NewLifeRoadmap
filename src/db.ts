import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Node, ImportStrategy } from './types';
import { generateTutorial } from './utils/tutorialData';

function log(..._args: any[]) {
  // Debug logging disabled
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
    await dbInstance!.put(STORE_NAME, node);
    for (const child of node.children) await saveSubtree(child);
  };
  for (const node of tutorialRoots) await saveSubtree(node);

  const updatedRoot: Node = {
    ...root,
    children: [...root.children, ...tutorialRoots],
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
    await dbInstance!.put(STORE_NAME, node);
    for (const child of node.children) await saveSubtree(child);
  };
  await saveSubtree(wrapper);

  const updatedRoot: Node = {
    ...root,
    children: [...root.children, wrapper],
    updatedAt: new Date().toISOString(),
  };
  await dbInstance!.put(STORE_NAME, updatedRoot);
}

// Получить корневой узел
export async function getRoot(): Promise<Node> {
  if (!dbInstance) await initDB();
  const node = await dbInstance!.get(STORE_NAME, ROOT_ID);
  if (!node) {
    throw new Error('Root node not found');
  }
  // Исправляем parentId если он неправильный
  if (node.parentId !== null) {
    log(`Fixing root node parentId: ${node.parentId} -> null`);
    node.parentId = null;
    await dbInstance!.put(STORE_NAME, node);
  }
  return node;
}

// Получить узел по ID
export async function getNode(id: string): Promise<Node | null> {
  if (!dbInstance) await initDB();
  const node = await dbInstance!.get(STORE_NAME, id) || null;
  // Исправляем корневой узел если нужно
  if (node && node.id === ROOT_ID && node.parentId !== null) {
    log(`Fixing root node parentId: ${node.parentId} -> null`);
    node.parentId = null;
    await dbInstance!.put(STORE_NAME, node);
  }
  // Скрываем удаленные узлы (только для UI), но оставляем их в БД для синхронизации
  if (node && node.deletedAt && node.id !== ROOT_ID) {
    return null;
  }
  return node;
}

// Получить все узлы из БД
export async function getAllNodes(): Promise<Node[]> {
  if (!dbInstance) await initDB();
  const nodes = await dbInstance!.getAll(STORE_NAME);
  
  // Исправляем корневой узел: если это root-node, parentId должен быть null
  for (const node of nodes) {
    if (node.id === ROOT_ID && node.parentId !== null) {
      log(`Fixing root node: parentId should be null, got ${node.parentId}`);
      node.parentId = null;
      // Сохраняем исправленный узел
      try {
        await dbInstance!.put(STORE_NAME, node);
        log('Root node fixed');
      } catch (err) {
        console.error('Error fixing root node:', err);
      }
    }
  }
  
  log(`Retrieved ${nodes.length} nodes from DB`);
  return nodes;
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

// Сохранить узел (и поддерево через denormalized структуру)
// Сохраняем сам узел и всех потомков в БД отдельно
export async function saveNode(node: Node): Promise<void> {
  if (!dbInstance) await initDB();
  log(`Saving node: ${node.id} (${node.title})`);
  const nodeToSave: Node = {
    ...node,
    updatedAt: new Date().toISOString(),
  };
  
  // Сохраняем сам узел (keyPath автоматически использует nodeToSave.id)
  await dbInstance!.put(STORE_NAME, nodeToSave);
  log(`Node saved: ${node.id}`);
  
  // Сохраняем всех потомков рекурсивно
  const saveSubtree = async (n: Node) => {
    // Сохраняем узел как есть, не обновляя updatedAt принудительно для всех потомков
    // Если потомок был изменен, его updatedAt уже должен быть обновлен в памяти
    await dbInstance!.put(STORE_NAME, n);
    for (const child of n.children) {
      await saveSubtree(child);
    }
  };
  for (const child of node.children) {
    await saveSubtree(child);
  }
  
  // Обновляем родительский узел, чтобы включить изменения
  if (node.parentId) {
    const parent = await getNode(node.parentId);
    if (parent) {
      // Находим и обновляем дочерний узел в родителе
      const existingIndex = parent.children.findIndex(child => child.id === node.id);
      let updatedChildren: Node[];
      
      if (existingIndex >= 0) {
        // Обновляем существующий дочерний узел
        updatedChildren = parent.children.map(child =>
          child.id === node.id ? nodeToSave : child
        );
      } else {
        // Добавляем новый дочерний узел
        updatedChildren = [...parent.children, nodeToSave];
      }
      
      const updatedParent: Node = {
        ...parent,
        children: updatedChildren,
        updatedAt: new Date().toISOString(),
      };
      await saveNode(updatedParent);
    }
  }
}

// Удалить узел и всех потомков
export async function deleteNode(id: string): Promise<void> {
  if (!dbInstance) await initDB();
  
  log(`Deleting node: ${id}`);
  if (id === ROOT_ID) {
    log('Root node deletion is blocked');
    return;
  }
  // Находим узел
  const node = await dbInstance!.get(STORE_NAME, id);
  if (!node) {
    log(`Node not found: ${id}`);
    return;
  }
  
  const deletedAt = new Date().toISOString();
  const markDeleted = async (n: Node): Promise<void> => {
    const tombstone: Node = {
      ...n,
      deletedAt,
      updatedAt: deletedAt,
      children: n.children || [],
    };
    await dbInstance!.put(STORE_NAME, tombstone);
    for (const child of n.children) {
      await markDeleted(child);
    }
  };
  
  // Ставим tombstone для узла и всех потомков
  await markDeleted(node);
  log(`Node soft-deleted: ${id}`);
  
  // Удаляем узел из родителя
  if (node.parentId) {
    const parent = await getNode(node.parentId);
    if (parent) {
      const updatedChildren = parent.children.filter(child => child.id !== id);
      const updatedParent: Node = {
        ...parent,
        children: updatedChildren,
        updatedAt: deletedAt,
      };
      await saveNode(updatedParent);
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
    const nodeWithUpdated = {
      ...n,
      updatedAt: new Date().toISOString(),
    };
    await dbInstance!.put(STORE_NAME, nodeWithUpdated);
    for (const child of n.children) {
      await saveSubtree(child);
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

