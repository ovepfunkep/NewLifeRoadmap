import { Node, DeadlineStatus } from './types';

// Обход поддерева узла
export function walkSubtree(node: Node, callback: (n: Node) => void): void {
  callback(node);
  node.children.forEach(child => walkSubtree(child, callback));
}

// Получить все листья (узлы без детей)
export function flattenLeaves(node: Node): Node[] {
  if (node.children.length === 0) {
    return [node];
  }
  return node.children.flatMap(child => flattenLeaves(child));
}

// Вычислить прогресс узла (доля выполненных листьев)
// Важно: если узел помечен completed, все потомки считаются выполненными
export function computeProgress(node: Node): number {
  if (node.completed) {
    return 100;
  }
  
  const leaves = flattenLeaves(node);
  if (leaves.length === 0) {
    return node.completed ? 100 : 0;
  }
  
  // Проверяем всех потомков: если любой родитель выполнен, считаем лист выполненным
  let completedCount = 0;
  
  const isCompletedLeaf = (leaf: Node, root: Node): boolean => {
    if (leaf.completed) return true;
    
    // Проверяем цепочку родителей до корня
    const checkParent = (n: Node, targetId: string): Node | null => {
      for (const child of n.children) {
        if (child.id === targetId) {
          return n;
        }
        const found = checkParent(child, targetId);
        if (found) return found;
      }
      return null;
    };
    
    let current: Node | null = leaf;
    while (current && current.id !== root.id) {
      const parent = checkParent(root, current.id);
      if (!parent) break;
      if (parent.completed) return true;
      current = parent;
    }
    
    return false;
  };
  
  leaves.forEach(leaf => {
    if (isCompletedLeaf(leaf, node)) {
      completedCount++;
    }
  });
  
  return Math.round((completedCount / leaves.length) * 100);
}

// Получить количество выполненных и общее количество листьев
export function getProgressCounts(node: Node): { completed: number; total: number } {
  const leaves = flattenLeaves(node);
  if (leaves.length === 0) {
    return { completed: node.completed ? 1 : 0, total: 1 };
  }
  
  if (node.completed) {
    return { completed: leaves.length, total: leaves.length };
  }
  
  let completedCount = 0;
  
  const isCompletedLeaf = (leaf: Node, root: Node): boolean => {
    if (leaf.completed) return true;
    
    const checkParent = (n: Node, targetId: string): Node | null => {
      for (const child of n.children) {
        if (child.id === targetId) {
          return n;
        }
        const found = checkParent(child, targetId);
        if (found) return found;
      }
      return null;
    };
    
    let current: Node | null = leaf;
    while (current && current.id !== root.id) {
      const parent = checkParent(root, current.id);
      if (!parent) break;
      if (parent.completed) return true;
      current = parent;
    }
    
    return false;
  };
  
  leaves.forEach(leaf => {
    if (isCompletedLeaf(leaf, node)) {
      completedCount++;
    }
  });
  
  return { completed: completedCount, total: leaves.length };
}

// Статус дедлайна
export function deadlineStatus(node: Node): DeadlineStatus {
  if (!node.deadline) {
    return 'none';
  }
  
  const deadline = new Date(node.deadline);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return 'overdue';
  }
  if (diffDays <= 3) {
    return 'soon';
  }
  return 'future';
}

// Цвет дедлайна: красный < недели, жёлтый < месяца, иначе акцентный
export function getDeadlineColor(node: Node): string {
  if (!node.deadline) {
    return 'var(--accent)';
  }
  
  const deadline = new Date(node.deadline);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    // Просрочено - красный
    return '#ef4444'; // red-500
  }
  if (diffDays < 7) {
    // Меньше недели - красный
    return '#ef4444'; // red-500
  }
  if (diffDays < 30) {
    // Меньше месяца - жёлтый
    return '#eab308'; // yellow-500
  }
  // Больше месяца - акцентный
  return 'var(--accent)';
}

// Собрать все дедлайны из поддерева
export function collectDeadlines(node: Node): Node[] {
  const deadlines: Node[] = [];
  walkSubtree(node, (n) => {
    if (n.deadline && n.id !== node.id) { // исключаем сам узел, только потомки
      deadlines.push(n);
    }
  });
  return deadlines;
}

// Сортировка по дедлайну (по возрастанию)
export function sortByDeadlineAsc(nodes: Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
  });
}

// Генерация уникального ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Перегенерировать ID для узла и всех потомков (для импорта)
export function remapIds(node: Node, existingIds: Set<string>): Node {
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newId = existingIds.has(node.id) ? generateId() : node.id;
  existingIds.add(newId);
  
  return {
    ...node,
    id: newId,
    children: node.children.map(child => remapIds(child, existingIds)),
  };
}

// Построить хлебные крошки (цепочку родителей)
export async function buildBreadcrumbs(
  nodeId: string,
  getNode: (id: string) => Promise<Node | null>
): Promise<Node[]> {
  const breadcrumbs: Node[] = [];
  let currentId: string | null = nodeId;
  const visitedIds = new Set<string>(); // Защита от циклических ссылок
  
  while (currentId) {
    // Защита от циклических ссылок
    if (visitedIds.has(currentId)) {
      console.warn(`Circular reference detected in breadcrumbs at node ${currentId}`);
      break;
    }
    visitedIds.add(currentId);
    
    const node = await getNode(currentId);
    if (!node) break;
    
    breadcrumbs.unshift(node); // добавляем в начало
    currentId = node.parentId;
    
    // Ограничение глубины для безопасности
    if (breadcrumbs.length > 100) {
      console.warn('Breadcrumbs depth limit reached (100)');
      break;
    }
  }
  
  return breadcrumbs;
}
