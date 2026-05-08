import { Node, NodeRecurrence, RecurrenceScheduleVariant } from '../types';

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

/** Варианты для weekly/monthly: из scheduleVariants или одна «плоская» запись (старые данные). */
export function normalizeRecurrenceVariants(rule: NodeRecurrence): RecurrenceScheduleVariant[] {
  if (rule.freq === 'daily') return [];
  if (Array.isArray(rule.scheduleVariants) && rule.scheduleVariants.length > 0) {
    return rule.scheduleVariants;
  }
  return [
    {
      weekdays: rule.weekdays,
      monthDays: rule.monthDays,
      timeStart: rule.timeStart ?? null,
      timeEnd: rule.timeEnd ?? null,
    },
  ];
}

function findVariantsForDay(rule: NodeRecurrence, day: Date): RecurrenceScheduleVariant[] {
  const variants = normalizeRecurrenceVariants(rule);
  if (rule.freq === 'weekly') {
    return variants.filter(
      (v) => Array.isArray(v.weekdays) && v.weekdays.length > 0 && v.weekdays.includes(day.getDay())
    );
  }
  if (rule.freq === 'monthly') {
    return variants.filter(
      (v) => Array.isArray(v.monthDays) && v.monthDays.length > 0 && v.monthDays.includes(day.getDate())
    );
  }
  return [];
}

function isMatchWeekly(rule: NodeRecurrence, day: Date): boolean {
  return findVariantsForDay(rule, day).length > 0;
}

function isMatchMonthly(rule: NodeRecurrence, day: Date): boolean {
  return findVariantsForDay(rule, day).length > 0;
}

function isRecurringOnDay(rule: NodeRecurrence, day: Date): boolean {
  if (rule.freq === 'daily') return isMatchDaily(rule);
  if (rule.freq === 'weekly') return isMatchWeekly(rule, day);
  if (rule.freq === 'monthly') return isMatchMonthly(rule, day);
  return false;
}

function buildSlotFromVariant(node: Node, day: Date, variant: RecurrenceScheduleVariant): RecurringScheduleSlot {
  const startMinutes = parseTimeToMinutes(variant.timeStart ?? null);
  const endMinutes = parseTimeToMinutes(variant.timeEnd ?? null);
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

function buildSlotDaily(node: Node, day: Date): RecurringScheduleSlot {
  const rule = node.recurrence!;
  const startMinutes = parseTimeToMinutes(rule.timeStart ?? null);
  const endMinutes = parseTimeToMinutes(rule.timeEnd ?? null);
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

/** Два интервала в один календарный день (weekly/monthly варианты) пересекаются по времени. */
export function recurrenceVariantsTimeOverlapOnSharedDay(
  freq: 'weekly' | 'monthly',
  variants: RecurrenceScheduleVariant[]
): boolean {
  type Desc = { allDay: true } | { allDay: false; start: number; end: number };

  const describe = (v: RecurrenceScheduleVariant): Desc => {
    const s = (v.timeStart ?? '').trim();
    const e = (v.timeEnd ?? '').trim();
    if (!s && !e) return { allDay: true };
    const sm = parseTimeToMinutes(s);
    const em = parseTimeToMinutes(e);
    if (sm === null || em === null || em <= sm) return { allDay: true };
    return { allDay: false, start: sm, end: Math.min(em, MINUTES_PER_DAY) };
  };

  const pairOverlaps = (a: Desc, b: Desc): boolean => {
    if (a.allDay || b.allDay) return true;
    return a.start < b.end && b.start < a.end;
  };

  const listOverlaps = (list: RecurrenceScheduleVariant[]): boolean => {
    const desc = list.map(describe);
    for (let i = 0; i < desc.length; i++) {
      for (let j = i + 1; j < desc.length; j++) {
        if (pairOverlaps(desc[i], desc[j])) return true;
      }
    }
    return false;
  };

  if (freq === 'weekly') {
    for (let wd = 0; wd <= 6; wd++) {
      const onDay = variants.filter((v) => (v.weekdays ?? []).includes(wd));
      if (onDay.length < 2) continue;
      if (listOverlaps(onDay)) return true;
    }
    return false;
  }

  for (let md = 1; md <= 31; md++) {
    const onDay = variants.filter((v) => (v.monthDays ?? []).includes(md));
    if (onDay.length < 2) continue;
    if (listOverlaps(onDay)) return true;
  }
  return false;
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
      const rule = node.recurrence;
      if (!rule) continue;
      if (rule.freq === 'daily') {
        if (!isRecurringOnDay(rule, day)) continue;
        slots.push(buildSlotDaily(node, day));
        continue;
      }
      const dayVariants = findVariantsForDay(rule, day);
      for (const v of dayVariants) {
        slots.push(buildSlotFromVariant(node, day, v));
      }
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
      const rule = node.recurrence;
      for (const day of days) {
        if (!isNodeActiveInRange(node, day)) continue;
        if (rule.freq === 'daily') {
          if (!isRecurringOnDay(rule, day)) continue;
          slots.push(buildSlotDaily(node, day));
          continue;
        }
        const dayVariants = findVariantsForDay(rule, day);
        for (const v of dayVariants) {
          slots.push(buildSlotFromVariant(node, day, v));
        }
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
