import { Node, NodeRecurrence } from '../types';

export interface RecurringScheduleSlot {
  taskId: string;
  title: string;
  description?: string;
  day: Date;
  dayKey: string;
  isAllDay: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
}

const MINUTES_PER_DAY = 24 * 60;

function toDayStart(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function isNodeActiveInRange(node: Node, day: Date): boolean {
  if (node.completed || node.deletedAt) return false;
  const createdAt = new Date(node.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return true;
  return toDayStart(day).getTime() >= toDayStart(new Date(createdAt)).getTime();
}

function isMatchDaily(_rule: NodeRecurrence): boolean {
  return true;
}

function isMatchWeekly(rule: NodeRecurrence, day: Date): boolean {
  if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0) return false;
  return rule.weekdays.includes(day.getDay());
}

function isMatchMonthly(rule: NodeRecurrence, day: Date): boolean {
  if (!Array.isArray(rule.monthDays) || rule.monthDays.length === 0) return false;
  return rule.monthDays.includes(day.getDate());
}

function isRecurringOnDay(rule: NodeRecurrence, day: Date): boolean {
  if (rule.freq === 'daily') return isMatchDaily(rule);
  if (rule.freq === 'weekly') return isMatchWeekly(rule, day);
  if (rule.freq === 'monthly') return isMatchMonthly(rule, day);
  return false;
}

function buildSlot(node: Node, day: Date): RecurringScheduleSlot {
  const startMinutes = parseTimeToMinutes(node.recurrence?.timeStart ?? null);
  const endMinutes = parseTimeToMinutes(node.recurrence?.timeEnd ?? null);
  const hasTimedRange = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
  const safeEnd = hasTimedRange ? Math.min(endMinutes!, MINUTES_PER_DAY) : null;

  return {
    taskId: node.id,
    title: node.title,
    description: node.description,
    day: toDayStart(day),
    dayKey: toDayKey(day),
    isAllDay: !hasTimedRange,
    startMinutes: hasTimedRange ? startMinutes : null,
    endMinutes: hasTimedRange ? safeEnd : null,
  };
}

function buildOneOffSlot(node: Node, deadlineDate: Date): RecurringScheduleSlot {
  const startMinutes = minutesFromDate(deadlineDate);
  const hasExplicitTime = startMinutes > 0;
  let endMinutes: number | null = hasExplicitTime ? Math.min(startMinutes + 60, MINUTES_PER_DAY) : null;
  if (hasExplicitTime && node.deadlineEnd) {
    const deadlineEndDate = new Date(node.deadlineEnd);
    if (Number.isFinite(deadlineEndDate.getTime()) && toDayKey(deadlineEndDate) === toDayKey(deadlineDate)) {
      const parsedEnd = minutesFromDate(deadlineEndDate);
      if (parsedEnd > startMinutes) {
        endMinutes = Math.min(parsedEnd, MINUTES_PER_DAY);
      }
    }
  }

  return {
    taskId: node.id,
    title: node.title,
    description: node.description,
    day: toDayStart(deadlineDate),
    dayKey: toDayKey(deadlineDate),
    isAllDay: !hasExplicitTime,
    startMinutes: hasExplicitTime ? startMinutes : null,
    endMinutes,
  };
}

function isWithinRange(day: Date, from: Date, to: Date): boolean {
  const time = toDayStart(day).getTime();
  return time >= toDayStart(from).getTime() && time <= toDayStart(to).getTime();
}

export function getRollingDays(fromDate: Date, daysCount = 7): Date[] {
  const start = toDayStart(fromDate);
  const days: Date[] = [];
  for (let i = 0; i < daysCount; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

export function expandRecurringNodesToSlots(
  nodes: Node[],
  fromDate: Date,
  daysCount = 7
): RecurringScheduleSlot[] {
  const days = getRollingDays(fromDate, daysCount);
  const slots: RecurringScheduleSlot[] = [];

  for (const node of nodes) {
    if (!node.isRecurring || !node.recurrence) continue;

    for (const day of days) {
      if (!isNodeActiveInRange(node, day)) continue;
      if (!isRecurringOnDay(node.recurrence, day)) continue;
      slots.push(buildSlot(node, day));
    }
  }

  return slots.sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
    return (a.startMinutes ?? 0) - (b.startMinutes ?? 0);
  });
}

export function expandNodesToSlots(
  nodes: Node[],
  fromDate: Date,
  daysCount = 7
): RecurringScheduleSlot[] {
  const days = getRollingDays(fromDate, daysCount);
  const lastDay = days[days.length - 1];
  const slots: RecurringScheduleSlot[] = [];

  for (const node of nodes) {
    if (node.completed || node.deletedAt) continue;

    if (node.isRecurring && node.recurrence) {
      for (const day of days) {
        if (!isNodeActiveInRange(node, day)) continue;
        if (!isRecurringOnDay(node.recurrence, day)) continue;
        slots.push(buildSlot(node, day));
      }
      continue;
    }

    if (!node.deadline) continue;
    const deadlineDate = new Date(node.deadline);
    if (!Number.isFinite(deadlineDate.getTime())) continue;
    if (!isWithinRange(deadlineDate, days[0], lastDay)) continue;
    slots.push(buildOneOffSlot(node, deadlineDate));
  }

  return slots.sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
    return (a.startMinutes ?? 0) - (b.startMinutes ?? 0);
  });
}
