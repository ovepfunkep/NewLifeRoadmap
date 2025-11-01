import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Node, ImportStrategy } from './types';

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
  if (dbInstance) return;
  
  dbInstance = await openDB<LifeRoadmapDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Если версия < 2, удаляем старый store (он был без keyPath)
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      // Создаём store с keyPath для автоматического использования id как ключа
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
  
  // Создаём корневой узел, если его нет
  const existingRoot = await dbInstance.get(STORE_NAME, ROOT_ID);
  if (!existingRoot) {
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
  }
}

// Получить корневой узел
export async function getRoot(): Promise<Node> {
  if (!dbInstance) await initDB();
  const node = await dbInstance!.get(STORE_NAME, ROOT_ID);
  if (!node) {
    throw new Error('Root node not found');
  }
  return node;
}

// Получить узел по ID
export async function getNode(id: string): Promise<Node | null> {
  if (!dbInstance) await initDB();
  return await dbInstance!.get(STORE_NAME, id) || null;
}

// Сохранить узел (и поддерево через denormalized структуру)
// Сохраняем сам узел и всех потомков в БД отдельно
export async function saveNode(node: Node): Promise<void> {
  if (!dbInstance) await initDB();
  const nodeToSave: Node = {
    ...node,
    updatedAt: new Date().toISOString(),
  };
  
  // Сохраняем сам узел (keyPath автоматически использует nodeToSave.id)
  await dbInstance!.put(STORE_NAME, nodeToSave);
  
  // Сохраняем всех потомков рекурсивно
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
  
  // Находим узел
  const node = await getNode(id);
  if (!node) return;
  
  // Удаляем узел из БД
  await dbInstance!.delete(STORE_NAME, id);
  
  // Удаляем всех потомков рекурсивно
  for (const child of node.children) {
    await deleteNode(child.id);
  }
  
  // Удаляем узел из родителя
  if (node.parentId) {
    const parent = await getNode(node.parentId);
    if (parent) {
      const updatedChildren = parent.children.filter(child => child.id !== id);
      const updatedParent: Node = {
        ...parent,
        children: updatedChildren,
        updatedAt: new Date().toISOString(),
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

