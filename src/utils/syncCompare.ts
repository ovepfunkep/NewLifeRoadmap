import { Node, type NodeRecurrence } from '../types';

/** Пустое и отсутствующее ISO-поле — одно и то же (IDB vs Firestore). */
function normIsoField(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return v;
}

function normParentId(parentId: string | null | undefined, nodeId: string): string | null {
  if (nodeId === 'root-node') return null;
  return parentId ?? null;
}

function stableJsonKey(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonKey(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJsonKey(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Канонический ключ recurrence (порядок ключей / вариантов не важен). */
function recurrenceCompareKey(r: NodeRecurrence | null | undefined): string {
  if (r == null) return 'null';
  const copy = JSON.parse(JSON.stringify(r)) as NodeRecurrence;
  if (Array.isArray(copy.scheduleVariants) && copy.scheduleVariants.length > 0) {
    copy.scheduleVariants = [...copy.scheduleVariants].sort((a, b) =>
      stableJsonKey(a).localeCompare(stableJsonKey(b)),
    );
  }
  return stableJsonKey(copy);
}

export function recurrenceEqual(
  a: NodeRecurrence | null | undefined,
  b: NodeRecurrence | null | undefined,
): boolean {
  return recurrenceCompareKey(a) === recurrenceCompareKey(b);
}

/** Список полей, по которым версии узла считаются разными для конфликта / диалога. */
export function getNodeDiffFieldNames(local: Node, cloud: Node): string[] {
  const differences: string[] = [];
  if (local.title !== cloud.title) differences.push('title');
  if (normDesc(local) !== normDesc(cloud)) differences.push('description');
  if (local.completed !== cloud.completed) differences.push('completed');
  if (normIsoField(local.deadline) !== normIsoField(cloud.deadline)) differences.push('deadline');
  if (normIsoField(local.deadlineEnd) !== normIsoField(cloud.deadlineEnd)) differences.push('deadlineEnd');
  if (!!local.isRecurring !== !!cloud.isRecurring) differences.push('isRecurring');
  if (!recurrenceEqual(local.recurrence, cloud.recurrence)) differences.push('recurrence');
  if (!!local.priority !== !!cloud.priority) differences.push('priority');
  if (normParentId(local.parentId, local.id) !== normParentId(cloud.parentId, cloud.id)) {
    differences.push('parentId');
  }
  if (normOrder(local.order) !== normOrder(cloud.order)) differences.push('order');
  if (normIsoField(local.deletedAt) !== normIsoField(cloud.deletedAt)) differences.push('deletedAt');
  return differences;
}

/** Время updatedAt для LWW; отсутствие даты считаем 0 (устаревшая версия). */
export function nodeUpdatedAtMs(node: Pick<Node, 'updatedAt'> | undefined | null): number {
  if (!node?.updatedAt) return 0;
  const t = new Date(node.updatedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * При инкрементальной подтяжке из облака: не затирать локальную запись, если она новее по updatedAt.
 * Раньше входящий узел всегда клался поверх локального — локальные правки после облачного коммита терялись.
 */
export function pickNewerNodeByUpdatedAt(local: Node | undefined, incoming: Node): Node {
  const flat = (n: Node) => ({ ...n, children: [] as Node[] });
  if (!local) return flat(incoming);
  const l = nodeUpdatedAtMs(local);
  const i = nodeUpdatedAtMs(incoming);
  if (i > l) return flat(incoming);
  return flat(local);
}

function normDesc(n: Node): string {
  return n.description ?? '';
}

function normOrder(o: number | undefined): number {
  return typeof o === 'number' && Number.isFinite(o) ? o : 0;
}

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
      const differences = getNodeDiffFieldNames(local, cloud);

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
  const localDeleted = !!normIsoField(local.deletedAt);
  const cloudDeleted = !!normIsoField(cloud.deletedAt);

  // Если оба удалены - это НЕ значимое различие, даже если даты удаления разные
  if (localDeleted && cloudDeleted) return false;

  // Разный статус удаления - это значимо
  if (localDeleted !== cloudDeleted) return true;

  return getNodeDiffFieldNames(local, cloud).some((f) => f !== 'order' && f !== 'deletedAt');
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



