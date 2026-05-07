import { Node } from '../types';

export type DashboardPeriod = 'year' | 'quarter' | 'month' | 'week';
type DashboardDetailPeriod = 'quarter' | 'month' | 'week' | 'day';

export interface DashboardTreemapNode {
  id: string;
  name: string;
  size: number;
  kind: 'project' | 'task';
  children?: DashboardTreemapNode[];
  [key: string]: unknown;
}

export interface DashboardSeriesPoint {
  key: string;
  label: string;
  created: number;
  closed: number;
  open: number;
  completionRate: number;
  cumulativeCreated: number;
  cumulativeClosed: number;
  netFlow: number;
}

export interface DashboardSummary {
  leafTotal: number;
  openNow: number;
  closedNow: number;
  completionRateNow: number;
  withDeadline: number;
  withoutDeadline: number;
}

export interface DashboardStats {
  isLeafSelection: boolean;
  currentPeriodLabel: string;
  summary: DashboardSummary;
  trend: DashboardSeriesPoint[];
  periodWindow: DashboardSeriesPoint[];
  openClosedSplit: Array<{ name: string; value: number }>;
  deadlineSplit: Array<{ name: string; value: number }>;
  weekdayClosings: Array<{ name: string; value: number }>;
  topProjects: Array<{ id: string; name: string; size: number }>;
  treemapRoot: DashboardTreemapNode;
}

interface PeriodRange {
  start: Date;
  end: Date;
}

function toTime(iso?: string | null): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : null;
}

function activeChildren(node: Node): Node[] {
  return node.children.filter(child => !child.deletedAt);
}

function detailPeriod(period: DashboardPeriod): DashboardDetailPeriod {
  if (period === 'year') return 'quarter';
  if (period === 'quarter') return 'month';
  if (period === 'month') return 'week';
  return 'day';
}

function collectLeafTasks(node: Node): Node[] {
  const children = activeChildren(node);
  if (children.length === 0) return [node];
  return children.flatMap(collectLeafTasks);
}

function isLeafSelection(node: Node): boolean {
  return activeChildren(node).length === 0;
}

function isVisibleByEnd(node: Node, endMs: number): boolean {
  if (node.deletedAt) return false;
  const createdAt = toTime(node.createdAt);
  if (createdAt === null) return true;
  return createdAt <= endMs;
}

function isClosedByEnd(node: Node, endMs: number): boolean {
  if (!node.completed) return false;
  const completedAt = toTime(node.completedAt);
  if (completedAt === null) return true;
  return completedAt <= endMs;
}

function visibleChildren(node: Node, endMs: number): Node[] {
  return activeChildren(node).filter(child => isVisibleByEnd(child, endMs));
}

function countDirectOpenLeafTasksByEnd(node: Node, endMs: number): number {
  return activeChildren(node).filter(child => {
    if (!isVisibleByEnd(child, endMs)) return false;
    if (activeChildren(child).length !== 0) return false;
    return !isClosedByEnd(child, endMs);
  }).length;
}

function collectProjectsWithDirectLeafChildren(node: Node, endMs: number): DashboardTreemapNode[] {
  const children = visibleChildren(node, endMs);
  const result: DashboardTreemapNode[] = [];

  for (const child of children) {
    const directChildren = activeChildren(child);
    if (directChildren.length === 0) continue;

    const directOpenLeafTasks = countDirectOpenLeafTasksByEnd(child, endMs);
    if (directOpenLeafTasks > 0) {
      result.push({
        id: child.id,
        name: child.title,
        size: directOpenLeafTasks,
        kind: 'project',
      });
    }

    result.push(...collectProjectsWithDirectLeafChildren(child, endMs));
  }

  return result;
}

function periodStart(date: Date, period: DashboardPeriod): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  if (period === 'year') return new Date(value.getFullYear(), 0, 1);
  if (period === 'quarter') return new Date(value.getFullYear(), Math.floor(value.getMonth() / 3) * 3, 1);
  if (period === 'month') return new Date(value.getFullYear(), value.getMonth(), 1);
  const mondayOffset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - mondayOffset);
  return value;
}

function shiftPeriod(date: Date, period: DashboardPeriod, offset: number): Date {
  if (period === 'year') return new Date(date.getFullYear() + offset, 0, 1);
  if (period === 'quarter') return new Date(date.getFullYear(), date.getMonth() + offset * 3, 1);
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset * 7);
}

function shiftDetailPeriod(date: Date, period: DashboardDetailPeriod, offset: number): Date {
  if (period === 'quarter') return new Date(date.getFullYear(), date.getMonth() + offset * 3, 1);
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth() + offset, 1);
  if (period === 'week') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset * 7);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

export function shiftDashboardAnchor(date: Date, period: DashboardPeriod, offset: number): Date {
  return shiftPeriod(periodStart(date, period), period, offset);
}

/** Label for a dashboard period window (matches stats header). */
export function dashboardPeriodLabel(date: Date, period: DashboardPeriod): string {
  return periodLabel(date, period);
}

/** Monday-start weeks whose Monday falls in `year` (same bucketing as dashboard `week` period). */
export function dashboardWeekStartsInYear(year: number): Date[] {
  const weeks: Date[] = [];
  let d = shiftDashboardAnchor(new Date(year, 0, 1), 'week', 0);
  while (d.getFullYear() < year) {
    d = shiftDashboardAnchor(d, 'week', 1);
  }
  while (d.getFullYear() === year) {
    weeks.push(new Date(d));
    d = shiftDashboardAnchor(d, 'week', 1);
  }
  return weeks;
}

function periodRange(date: Date, period: DashboardPeriod): PeriodRange {
  const start = periodStart(date, period);
  const nextStart = shiftPeriod(start, period, 1);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

function detailPeriodRange(date: Date, period: DashboardDetailPeriod): PeriodRange {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const nextStart = shiftDetailPeriod(start, period, 1);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

function periodLabel(date: Date, period: DashboardPeriod): string {
  if (period === 'year') return `${date.getFullYear()}`;
  if (period === 'quarter') return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  if (period === 'month') return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  return `${date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}-${end.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
}

function detailPeriodLabel(date: Date, period: DashboardDetailPeriod): string {
  if (period === 'quarter') return `Q${Math.floor(date.getMonth() / 3) + 1}`;
  if (period === 'month') return date.toLocaleDateString(undefined, { month: 'short' });
  if (period === 'week') {
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    return `${date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}-${end.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
}

function buildDetailBuckets(
  start: Date,
  end: Date,
  period: DashboardDetailPeriod
): Array<{ key: string; label: string; start: Date; end: Date }> {
  const buckets: Array<{ key: string; label: string; start: Date; end: Date }> = [];
  let cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endMs = end.getTime();

  while (cursor.getTime() <= endMs) {
    const range = detailPeriodRange(cursor, period);
    buckets.push({
      key: `${period}:${range.start.toISOString()}`,
      label: detailPeriodLabel(range.start, period),
      start: range.start,
      end: new Date(Math.min(range.end.getTime(), endMs)),
    });
    cursor = shiftDetailPeriod(cursor, period, 1);
  }

  return buckets;
}

function makeWindowPoint(leaves: Node[], period: DashboardPeriod, anchorStart: Date, offset: number): DashboardSeriesPoint {
  const anchor = shiftPeriod(anchorStart, period, offset);
  const { start, end } = periodRange(anchor, period);
  const startTime = start.getTime();
  const endTime = end.getTime();

  const created = leaves.filter(item => {
    const createdAt = toTime(item.createdAt);
    return createdAt !== null && createdAt >= startTime && createdAt <= endTime;
  }).length;

  const closed = leaves.filter(item => {
    const completedAt = toTime(item.completedAt);
    return completedAt !== null && completedAt >= startTime && completedAt <= endTime && item.completed;
  }).length;

  const visibleByEnd = leaves.filter(item => isVisibleByEnd(item, endTime));
  const closedByEnd = visibleByEnd.filter(item => isClosedByEnd(item, endTime)).length;
  const open = Math.max(0, visibleByEnd.length - closedByEnd);

  return {
    key: `${period}:${start.toISOString()}`,
    label: periodLabel(start, period),
    created,
    closed,
    open,
    completionRate: created > 0 ? Math.round((closed / created) * 100) : 0,
    cumulativeCreated: created,
    cumulativeClosed: closed,
    netFlow: created - closed,
  };
}

export function buildDashboardStats(
  selectedNode: Node,
  period: DashboardPeriod,
  anchorDate: Date = new Date()
): DashboardStats {
  const leaves = collectLeafTasks(selectedNode).filter(item => !item.deletedAt);
  const selectedRange = periodRange(periodStart(anchorDate, period), period);
  const selectedStartMs = selectedRange.start.getTime();
  const selectedEndMs = selectedRange.end.getTime();
  const visibleLeaves = leaves.filter(item => isVisibleByEnd(item, selectedEndMs));

  const closedNow = visibleLeaves.filter(item => isClosedByEnd(item, selectedEndMs)).length;
  const withDeadline = visibleLeaves.filter(item => Boolean(item.deadline)).length;

  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const weekdayClosings = dayOrder.map(name => ({ name, value: 0 }));
  for (const item of leaves) {
    const completedAt = toTime(item.completedAt);
    if (completedAt === null) continue;
    if (completedAt < selectedStartMs || completedAt > selectedEndMs) continue;
    const weekday = new Date(completedAt).getDay();
    const normalized = (weekday + 6) % 7;
    weekdayClosings[normalized].value += 1;
  }

  const detail = detailPeriod(period);
  const buckets = buildDetailBuckets(selectedRange.start, selectedRange.end, detail);
  let cumulativeCreated = 0;
  let cumulativeClosed = 0;
  const trend: DashboardSeriesPoint[] = buckets.map(bucket => {
    const bucketStartMs = bucket.start.getTime();
    const bucketEndMs = bucket.end.getTime();

    const created = leaves.filter(item => {
      const createdAt = toTime(item.createdAt);
      return createdAt !== null && createdAt >= bucketStartMs && createdAt <= bucketEndMs;
    }).length;

    const closed = leaves.filter(item => {
      const completedAt = toTime(item.completedAt);
      return completedAt !== null && completedAt >= bucketStartMs && completedAt <= bucketEndMs && item.completed;
    }).length;

    cumulativeCreated += created;
    cumulativeClosed += closed;

    return {
      key: bucket.key,
      label: bucket.label,
      created,
      closed,
      open: Math.max(0, cumulativeCreated - cumulativeClosed),
      completionRate: created > 0 ? Math.round((closed / created) * 100) : 0,
      cumulativeCreated,
      cumulativeClosed,
      netFlow: created - closed,
    };
  });

  const anchorStart = periodStart(anchorDate, period);
  const periodWindow = [-2, -1, 0, 1, 2].map(offset => makeWindowPoint(leaves, period, anchorStart, offset));

  const openNow = Math.max(0, visibleLeaves.length - closedNow);
  const topProjectNodes = collectProjectsWithDirectLeafChildren(selectedNode, selectedEndMs)
    .sort((a, b) => b.size - a.size);
  const topProjects = topProjectNodes.map(item => ({ id: item.id, name: item.name, size: item.size }));
  const treemapRoot: DashboardTreemapNode = {
    id: selectedNode.id,
    name: selectedNode.title,
    size: openNow,
    kind: 'project',
    children: topProjectNodes,
  };

  return {
    isLeafSelection: isLeafSelection(selectedNode),
    currentPeriodLabel: periodLabel(anchorStart, period),
    summary: {
      leafTotal: visibleLeaves.length,
      openNow,
      closedNow,
      completionRateNow: visibleLeaves.length > 0 ? Math.round((closedNow / visibleLeaves.length) * 100) : 0,
      withDeadline,
      withoutDeadline: Math.max(0, visibleLeaves.length - withDeadline),
    },
    trend,
    periodWindow,
    openClosedSplit: [
      { name: 'open', value: openNow },
      { name: 'closed', value: closedNow },
    ],
    deadlineSplit: [
      { name: 'withDeadline', value: withDeadline },
      { name: 'withoutDeadline', value: Math.max(0, visibleLeaves.length - withDeadline) },
    ],
    weekdayClosings,
    topProjects,
    treemapRoot,
  };
}
