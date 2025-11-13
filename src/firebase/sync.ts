import { collection, doc, getDoc, setDoc, getDocs, query, writeBatch } from 'firebase/firestore';
import { getFirebaseDB } from './config';
import { getCurrentUser } from './auth';
import { Node } from '../types';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  if (isDev) {
    console.log(`[Sync] ${message}`, ...args);
  }
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

  const db = getFirebaseDB();

  try {
    log(`Syncing node to Firestore: ${node.id} (${node.title})`);
    const nodeRef = doc(db, getUserNodesPath(user.uid), node.id);
    // Сохраняем узел без детей (дети хранятся отдельно)
    const { children, ...nodeData } = node;
    // Очищаем от undefined значений перед сохранением
    const cleanedData = cleanForFirestore({
      ...nodeData,
      syncedAt: new Date().toISOString(),
    });
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

  const db = getFirebaseDB();

  try {
    log(`Starting bulk sync: ${allNodes.length} nodes`);
    
    // Создаем Set из ID локальных узлов для быстрого поиска
    const localNodeIds = new Set(allNodes.map(node => node.id));
    
    // Загружаем все существующие узлы из Firestore
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const querySnapshot = await getDocs(query(nodesRef));
    
    // Определяем узлы, которые нужно удалить (есть в облаке, но нет в локальных)
    const nodesToDelete: string[] = [];
    const cloudNodeIds = new Set<string>();
    querySnapshot.forEach((docSnap) => {
      cloudNodeIds.add(docSnap.id);
      if (!localNodeIds.has(docSnap.id)) {
        nodesToDelete.push(docSnap.id);
        log(`Node to delete: ${docSnap.id} (exists in cloud but not in local)`);
      }
    });
    
    log(`Cloud nodes: ${cloudNodeIds.size}, Local nodes: ${localNodeIds.size}`);
    log(`Found ${nodesToDelete.length} nodes to delete, ${allNodes.length} nodes to sync`);
    
    // Проверяем, есть ли локальные узлы, которых нет в облаке
    const nodesToAdd: string[] = [];
    allNodes.forEach(node => {
      if (!cloudNodeIds.has(node.id)) {
        nodesToAdd.push(node.id);
      }
    });
    log(`Found ${nodesToAdd.length} nodes to add (exist in local but not in cloud)`);
    
    // Firestore batch ограничен 500 операциями
    const BATCH_LIMIT = 500;
    
    // СНАЧАЛА удаляем все старые узлы батчами
    if (nodesToDelete.length > 0) {
      for (let i = 0; i < nodesToDelete.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const batchToDelete = nodesToDelete.slice(i, i + BATCH_LIMIT);
        
        for (const nodeId of batchToDelete) {
          const nodeRef = doc(nodesRef, nodeId);
          batch.delete(nodeRef);
        }
        
        await batch.commit();
        log(`Delete batch ${Math.floor(i / BATCH_LIMIT) + 1} completed: ${batchToDelete.length} nodes deleted`);
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
          // Очищаем от undefined значений перед сохранением
          const cleanedData = cleanForFirestore({
            ...nodeData,
            syncedAt: new Date().toISOString(),
          });
          batch.set(nodeRef, cleanedData);
        }
        
        await batch.commit();
        log(`Save batch ${Math.floor(i / BATCH_LIMIT) + 1} completed: ${batchToSave.length} nodes saved`);
      }
    }
    
    log(`Bulk sync completed: ${nodesToDelete.length} nodes deleted, ${allNodes.length} nodes synced`);
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

  const db = getFirebaseDB();

  try {
    const nodeRef = doc(db, getUserNodesPath(user.uid), nodeId);
    const nodeSnap = await getDoc(nodeRef);
    
    if (!nodeSnap.exists()) {
      return null;
    }

    const data = nodeSnap.data();
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

  const db = getFirebaseDB();
  if (!db) {
    log('Firebase DB not initialized');
    return [];
  }

  try {
    log('Loading all nodes from Firestore');
    const nodesRef = collection(db, getUserNodesPath(user.uid));
    const querySnapshot = await getDocs(nodesRef);
    
    const nodes: Node[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      nodes.push({
        ...data,
        children: [], // Дети будут восстановлены отдельно
      } as unknown as Node);
    });

    log(`Loaded ${nodes.length} nodes from Firestore`);

    // Восстанавливаем иерархию (дети)
    const nodeMap = new Map<string, Node>();
    nodes.forEach(node => {
      nodeMap.set(node.id, { ...node, children: [] });
    });

    // Связываем детей с родителями
    const rootNodes: Node[] = [];
    nodes.forEach(node => {
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
    return Array.from(nodeMap.values());
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
    
    // Удаляем сам узел
    const nodeRef = doc(nodesRef, nodeId);
    batch.delete(nodeRef);
    
    // Удаляем всех детей
    for (const childId of childrenIds) {
      const childRef = doc(nodesRef, childId);
      batch.delete(childRef);
    }
    
    await batch.commit();
  } catch (error) {
    console.error('Error deleting node from Firestore:', error);
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

