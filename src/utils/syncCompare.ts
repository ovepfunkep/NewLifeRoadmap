import { Node } from '../types';

export interface SyncDiff {
  localOnly: Node[];
  cloudOnly: Node[];
  different: Array<{
    nodeId: string;
    local: Node;
    cloud: Node;
    differences: string[];
  }>;
}

/**
 * Сравнить локальные и облачные данные
 */
export function compareNodes(localNodes: Node[], cloudNodes: Node[]): SyncDiff {
  const localMap = new Map<string, Node>();
  const cloudMap = new Map<string, Node>();

  // Вспомогательная функция для построения плоской карты из любого списка (плоского или дерева)
  const buildFlatMap = (nodes: Node[], map: Map<string, Node>) => {
    const processed = new Set<string>();
    const stack = [...nodes];
    
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!node || processed.has(node.id)) continue;
      
      map.set(node.id, node);
      processed.add(node.id);
      
      if (node.children && Array.isArray(node.children)) {
        stack.push(...node.children);
      }
    }
  };

  buildFlatMap(localNodes, localMap);
  buildFlatMap(cloudNodes, cloudMap);

  const localOnly: Node[] = [];
  const cloudOnly: Node[] = [];
  const different: SyncDiff['different'] = [];

  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

  allIds.forEach(id => {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);

    if (local && !cloud) {
      localOnly.push(local);
    } else if (!local && cloud) {
      cloudOnly.push(cloud);
    } else if (local && cloud) {
      const differences: string[] = [];
      
      if (local.title !== cloud.title) differences.push('title');
      if (local.description !== cloud.description) differences.push('description');
      if (local.completed !== cloud.completed) differences.push('completed');
      if (local.deadline !== cloud.deadline) differences.push('deadline');
      if (local.priority !== cloud.priority) differences.push('priority');
      if (local.parentId !== cloud.parentId) differences.push('parentId');
      if (local.order !== cloud.order) differences.push('order');
      if (local.deletedAt !== cloud.deletedAt) differences.push('deletedAt');

      if (differences.length > 0) {
        different.push({
          nodeId: id,
          local,
          cloud,
          differences,
        });
      }
    }
  });

  return { localOnly, cloudOnly, different };
}

/**
 * Проверить, есть ли значимые различия между двумя версиями одного узла
 */
export function isSignificantNodeDiff(local: Node, cloud: Node): boolean {
  const localDeleted = !!local.deletedAt;
  const cloudDeleted = !!cloud.deletedAt;

  // Если оба удалены - это НЕ значимое различие, даже если даты удаления разные
  if (localDeleted && cloudDeleted) return false;

  // Разный статус удаления - это значимо
  if (localDeleted !== cloudDeleted) return true;

  // Оба активны - проверяем основные поля
  if (local.title !== cloud.title) return true;
  if (local.description !== cloud.description) return true;
  if (local.completed !== cloud.completed) return true;
  if (local.deadline !== cloud.deadline) return true;
  if (local.priority !== cloud.priority) return true;
  if (local.parentId !== cloud.parentId) return true;
  if (local.order !== cloud.order) return true;

  return false;
}

/**
 * Проверить, есть ли различия между локальными и облачными данными
 */
export function hasDifferences(localNodes: Node[], cloudNodes: Node[]): boolean {
  const diff = compareNodes(localNodes, cloudNodes);
  
  // 1. Узел есть только с одной стороны и он НЕ удален
  if (diff.localOnly.some(n => !n.deletedAt)) return true;
  if (diff.cloudOnly.some(n => !n.deletedAt)) return true;
  
  // 2. Узел есть с обеих сторон, но они значимо отличаются
  return diff.different.some(d => isSignificantNodeDiff(d.local, d.cloud));
}

/**
 * Получить корневой узел из массива узлов
 */
export function getRootNode(nodes: Node[]): Node | null {
  return nodes.find(node => !node.parentId || node.id === 'root-node') || null;
}



