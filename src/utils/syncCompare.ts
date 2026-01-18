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

  // Создаём карты для быстрого поиска
  const buildMap = (nodes: Node[], map: Map<string, Node>) => {
    const processed = new Set<string>(); // Узлы, которые уже добавлены в карту
    
    const processNode = (node: Node, path: Set<string> = new Set()) => {
      // Защита от циклических ссылок - проверяем текущий путь
      if (path.has(node.id)) {
        console.warn(`Circular reference detected in node tree at node ${node.id}`);
        return;
      }
      
      // Добавляем узел в карту только если его еще нет
      if (!processed.has(node.id)) {
        map.set(node.id, node);
        processed.add(node.id);
      }
      
      // Обрабатываем детей только если они есть
      if (node.children && Array.isArray(node.children)) {
        const newPath = new Set(path);
        newPath.add(node.id);
        node.children.forEach(child => processNode(child, newPath));
      }
    };
    
    nodes.forEach(node => processNode(node));
  };

  buildMap(localNodes, localMap);
  buildMap(cloudNodes, cloudMap);

  const localOnly: Node[] = [];
  const cloudOnly: Node[] = [];
  const different: SyncDiff['different'] = [];

  // Находим узлы только в локальной БД
  localMap.forEach((node, id) => {
    if (!cloudMap.has(id)) {
      localOnly.push(node);
    }
  });

  // Находим узлы только в облачной БД
  cloudMap.forEach((node, id) => {
    if (!localMap.has(id)) {
      cloudOnly.push(node);
    }
  });

  // Находим различающиеся узлы
  localMap.forEach((localNode, id) => {
    const cloudNode = cloudMap.get(id);
    if (cloudNode) {
      const differences: string[] = [];
      
      if (localNode.title !== cloudNode.title) {
        differences.push(`title: "${localNode.title}" vs "${cloudNode.title}"`);
      }
      if (localNode.description !== cloudNode.description) {
        differences.push('description');
      }
      if (localNode.completed !== cloudNode.completed) {
        differences.push(`completed: ${localNode.completed} vs ${cloudNode.completed}`);
      }
      if (localNode.deadline !== cloudNode.deadline) {
        differences.push('deadline');
      }
      if (localNode.priority !== cloudNode.priority) {
        differences.push(`priority: ${localNode.priority} vs ${cloudNode.priority}`);
      }
      if (localNode.parentId !== cloudNode.parentId) {
        differences.push('parentId');
      }
      if (localNode.order !== cloudNode.order) {
        differences.push(`order: ${localNode.order} vs ${cloudNode.order}`);
      }
      if (localNode.deletedAt !== cloudNode.deletedAt) {
        differences.push('deletedAt');
      }
      
      // Сравниваем количество детей
      const localChildrenCount = localNode.children?.length || 0;
      const cloudChildrenCount = cloudNode.children?.length || 0;
      if (localChildrenCount !== cloudChildrenCount) {
        differences.push(`children count: ${localChildrenCount} vs ${cloudChildrenCount}`);
      }

      if (differences.length > 0) {
        different.push({
          nodeId: id,
          local: localNode,
          cloud: cloudNode,
          differences,
        });
      }
    }
  });

  return { localOnly, cloudOnly, different };
}

/**
 * Проверить, есть ли различия между локальными и облачными данными
 */
export function hasDifferences(localNodes: Node[], cloudNodes: Node[]): boolean {
  const diff = compareNodes(localNodes, cloudNodes);
  return diff.localOnly.length > 0 || diff.cloudOnly.length > 0 || diff.different.length > 0;
}

/**
 * Получить корневой узел из массива узлов
 */
export function getRootNode(nodes: Node[]): Node | null {
  return nodes.find(node => !node.parentId || node.id === 'root-node') || null;
}



