import type { Node, NodeRecurrence } from '../types';
import { getNodeDiffFieldNames, recurrenceEqual } from './syncCompare';

export type NodeDiffFieldKey =
  | 'title'
  | 'description'
  | 'completed'
  | 'deadline'
  | 'deadlineEnd'
  | 'isRecurring'
  | 'recurrence'
  | 'priority'
  | 'parentId'
  | 'deletedAt';

function normIsoField(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return v;
}

function normDesc(n: Node): string {
  return (n.description ?? '').trim();
}

function normParentId(parentId: string | null | undefined, nodeId: string): string | null {
  if (nodeId === 'root-node') return null;
  return parentId ?? null;
}

/** Стабильное значение поля для сравнения «есть ли реальное отличие». */
function fieldCompareKey(node: Node, field: NodeDiffFieldKey): string {
  switch (field) {
    case 'title':
      return node.title ?? '';
    case 'description':
      return normDesc(node);
    case 'completed':
      return node.completed ? '1' : '0';
    case 'deadline':
      return normIsoField(node.deadline) ?? '';
    case 'deadlineEnd':
      return normIsoField(node.deadlineEnd) ?? '';
    case 'isRecurring':
      return node.isRecurring ? '1' : '0';
    case 'recurrence':
      return node.recurrence == null ? '' : JSON.stringify(node.recurrence);
    case 'priority':
      return node.priority ? '1' : '0';
    case 'parentId':
      return normParentId(node.parentId, node.id) ?? '';
    case 'deletedAt':
      return normIsoField(node.deletedAt) ?? '';
    default:
      return '';
  }
}

/** Поля для панели в диалоге: только те, где значения на двух сторонах реально различаются. */
function fieldsVisiblyDiffer(local: Node, cloud: Node, field: NodeDiffFieldKey): boolean {
  if (field === 'recurrence') return !recurrenceEqual(local.recurrence, cloud.recurrence);
  return fieldCompareKey(local, field) !== fieldCompareKey(cloud, field);
}

export function getDisplayDiffFields(local: Node, cloud: Node): NodeDiffFieldKey[] {
  return getNodeDiffFieldNames(local, cloud)
    .filter((f): f is NodeDiffFieldKey => f !== 'order')
    .filter((f) => fieldsVisiblyDiffer(local, cloud, f));
}

function formatIsoDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRecurrence(r: NodeRecurrence | null | undefined): string {
  if (!r) return '—';
  const parts: string[] = [];
  if (r.freq) parts.push(r.freq);
  if (r.weekdays?.length) parts.push(`d:${r.weekdays.join(',')}`);
  if (r.monthDays?.length) parts.push(`m:${r.monthDays.join(',')}`);
  if (r.yearlyMonth != null && r.yearlyMonthDay != null) {
    parts.push(`${r.yearlyMonth}.${r.yearlyMonthDay}`);
  }
  if (r.timeStart) parts.push(r.timeStart);
  if (r.timeEnd) parts.push(`–${r.timeEnd}`);
  if (r.scheduleVariants?.length) parts.push(`+${r.scheduleVariants.length}v`);
  if (parts.length > 0) return parts.join(' ');
  const raw = JSON.stringify(r);
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

export function formatNodeDiffFieldValue(
  node: Node,
  field: NodeDiffFieldKey,
  locale: string,
  titleById: Map<string, string>,
): string {
  switch (field) {
    case 'title':
      return node.title || '—';
    case 'description': {
      const d = normDesc(node);
      if (!d) return '—';
      return d.length > 200 ? `${d.slice(0, 197)}…` : d;
    }
    case 'completed':
      return node.completed ? 'yes' : 'no';
    case 'deadline':
      return formatIsoDate(node.deadline, locale);
    case 'deadlineEnd':
      return formatIsoDate(node.deadlineEnd, locale);
    case 'isRecurring':
      return node.isRecurring ? 'yes' : 'no';
    case 'recurrence':
      return formatRecurrence(node.recurrence);
    case 'priority':
      return node.priority ? 'yes' : 'no';
    case 'parentId': {
      const pid = normParentId(node.parentId, node.id);
      if (!pid) return '—';
      return titleById.get(pid) ?? pid;
    }
    case 'deletedAt':
      return formatIsoDate(node.deletedAt, locale);
    default:
      return '—';
  }
}
