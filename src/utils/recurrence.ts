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

/** Пустые обе границы — весь день; только «с» — часовой интервал со стандарным +60 мин к концу; обе заданы — явный интервал (конец необязательный в UI). */
function resolveTimedSlotMinutes(
  timeStart?: string | null,
  timeEnd?: string | null
): { isAllDay: boolean; startMinutes: number | null; endMinutes: number | null } {
  const sm = parseTimeToMinutes(timeStart ?? null);
  const em = parseTimeToMinutes(timeEnd ?? null);
  const hasStart = sm !== null;
  const hasEnd = em !== null;
  if (!hasStart && !hasEnd) {
    return { isAllDay: true, startMinutes: null, endMinutes: null };
  }
  if (hasStart && !hasEnd) {
    return {
      isAllDay: false,
      startMinutes: sm,
      endMinutes: Math.min((sm as number) + 60, MINUTES_PER_DAY),
    };
  }
  if (!hasStart && hasEnd) {
    return { isAllDay: true, startMinutes: null, endMinutes: null };
  }
  // both strings contributed to parsing attempt
  if (sm === null || em === null || em <= sm) {
    return { isAllDay: true, startMinutes: null, endMinutes: null };
  }
  return {
    isAllDay: false,
    startMinutes: sm,
    endMinutes: Math.min(em, MINUTES_PER_DAY),
  };
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
  if (rule.freq === 'yearly') {
    if (Array.isArray(rule.scheduleVariants) && rule.scheduleVariants.length > 0) {
      return rule.scheduleVariants;
    }
    if (rule.yearlyMonth != null && rule.yearlyMonthDay != null) {
      return [
        {
          yearlyMonth: rule.yearlyMonth,
          yearlyMonthDay: rule.yearlyMonthDay,
          timeStart: rule.timeStart ?? null,
          timeEnd: rule.timeEnd ?? null,
        },
      ];
    }
    return [];
  }
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
  if (rule.freq === 'yearly') {
    return variants.filter(
      (v) =>
        typeof v.yearlyMonth === 'number' &&
        typeof v.yearlyMonthDay === 'number' &&
        day.getMonth() + 1 === v.yearlyMonth &&
        day.getDate() === v.yearlyMonthDay
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

function isMatchYearly(rule: NodeRecurrence, day: Date): boolean {
  return findVariantsForDay(rule, day).length > 0;
}

function isRecurringOnDay(rule: NodeRecurrence, day: Date): boolean {
  if (rule.freq === 'daily') return isMatchDaily(rule);
  if (rule.freq === 'weekly') return isMatchWeekly(rule, day);
  if (rule.freq === 'monthly') return isMatchMonthly(rule, day);
  if (rule.freq === 'yearly') return isMatchYearly(rule, day);
  return false;
}

function addDaysToDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function anchorMsFromSlot(day: Date, slot: RecurringScheduleSlot): number {
  const d = toDayStart(day);
  if (!slot.isAllDay && slot.startMinutes != null) {
    d.setHours(Math.floor(slot.startMinutes / 60), slot.startMinutes % 60, 0, 0);
    return d.getTime();
  }
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function dummyRecurrenceNode(rule: NodeRecurrence, createdAtIso: string): Node {
  return {
    id: '__recurrence__',
    parentId: null,
    title: '',
    recurrence: rule,
    completed: false,
    createdAt: createdAtIso || '1970-01-01T00:00:00.000Z',
    children: [],
  } as Node;
}

/** Все моменты начала вхождений правила в этот календарный день (локальное время). */
function collectAnchorMsOnDay(rule: NodeRecurrence, day: Date, stub: Node): number[] {
  if (rule.freq === 'daily') {
    const slot = buildSlotDaily(stub, day);
    return [anchorMsFromSlot(day, slot)];
  }
  if (rule.freq === 'weekly' || rule.freq === 'monthly' || rule.freq === 'yearly') {
    const out: number[] = [];
    const dayVariants = findVariantsForDay(rule, day);
    for (const v of dayVariants) {
      out.push(anchorMsFromSlot(day, buildSlotFromVariant(stub, day, v)));
    }
    return out.sort((a, b) => a - b);
  }
  return [];
}

/** Ближайший момент события после `after` (строго больше), для напоминаний и т.п. */
export function computeNextOccurrenceStartMs(
  rule: NodeRecurrence,
  createdAtIso: string | undefined,
  after: Date
): number | null {
  const afterMs = after.getTime();
  const stub = dummyRecurrenceNode(rule, createdAtIso || '1970-01-01T00:00:00.000Z');
  const start = toDayStart(after);
  for (let i = 0; i < 800; i++) {
    const day = i === 0 ? start : addDaysToDate(start, i);
    if (!isNodeActiveInRange(stub, day)) continue;
    if (!isRecurringOnDay(rule, day)) continue;
    const anchors = collectAnchorMsOnDay(rule, day, stub);
    for (const ms of anchors) {
      if (ms > afterMs) return ms;
    }
  }
  return null;
}

/** События в диапазоне [fromMs, toMs] по локальному времени (для рассылки напоминаний). */
export function listOccurrenceAnchorsInRange(
  rule: NodeRecurrence,
  createdAtIso: string | undefined,
  from: Date,
  to: Date
): Array<{ eventMs: number; eventIso: string }> {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const res: Array<{ eventMs: number; eventIso: string }> = [];
  const stub = dummyRecurrenceNode(rule, createdAtIso || '1970-01-01T00:00:00.000Z');
  const scanStart = addDaysToDate(toDayStart(from), -1);
  for (let i = 0; i < 800; i++) {
    const day = addDaysToDate(scanStart, i);
    if (toDayStart(day).getTime() > toMs + 86400000) break;
    if (!isNodeActiveInRange(stub, day)) continue;
    if (!isRecurringOnDay(rule, day)) continue;
    for (const ms of collectAnchorMsOnDay(rule, day, stub)) {
      if (ms >= fromMs && ms <= toMs) {
        res.push({ eventMs: ms, eventIso: new Date(ms).toISOString() });
      }
    }
  }
  return res;
}

function buildSlotFromVariant(node: Node, day: Date, variant: RecurrenceScheduleVariant): RecurringScheduleSlot {
  const { isAllDay, startMinutes, endMinutes } = resolveTimedSlotMinutes(
    variant.timeStart ?? null,
    variant.timeEnd ?? null
  );

  return {
    taskId: node.id,
    title: node.title,
    description: node.description,
    day: toDayStart(day),
    dayKey: toDayKey(day),
    isAllDay,
    startMinutes,
    endMinutes,
  };
}

function buildSlotDaily(node: Node, day: Date): RecurringScheduleSlot {
  const rule = node.recurrence!;
  const { isAllDay, startMinutes, endMinutes } = resolveTimedSlotMinutes(
    rule.timeStart ?? null,
    rule.timeEnd ?? null
  );

  return {
    taskId: node.id,
    title: node.title,
    description: node.description,
    day: toDayStart(day),
    dayKey: toDayKey(day),
    isAllDay,
    startMinutes,
    endMinutes,
  };
}

/** Два интервала в один календарный день (weekly/monthly/yearly варианты) пересекаются по времени. */
export function recurrenceVariantsTimeOverlapOnSharedDay(
  freq: 'weekly' | 'monthly' | 'yearly',
  variants: RecurrenceScheduleVariant[]
): boolean {
  type Desc = { allDay: true } | { allDay: false; start: number; end: number };

  const describe = (v: RecurrenceScheduleVariant): Desc => {
    const s = (v.timeStart ?? '').trim();
    const e = (v.timeEnd ?? '').trim();
    if (!s && !e) return { allDay: true };
    const sm = parseTimeToMinutes(s);
    const em = parseTimeToMinutes(e);
    if (!s && e) return { allDay: true };
    if (s && !e) {
      if (sm === null) return { allDay: true };
      return { allDay: false, start: sm, end: Math.min(sm + 60, MINUTES_PER_DAY) };
    }
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

  if (freq === 'monthly') {
    for (let md = 1; md <= 31; md++) {
      const onDay = variants.filter((v) => (v.monthDays ?? []).includes(md));
      if (onDay.length < 2) continue;
      if (listOverlaps(onDay)) return true;
    }
    return false;
  }

  if (freq === 'yearly') {
    const buckets = new Map<string, RecurrenceScheduleVariant[]>();
    for (const v of variants) {
      const m = v.yearlyMonth;
      const md = v.yearlyMonthDay;
      if (m == null || md == null) continue;
      const key = `${m}-${md}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(v);
    }
    for (const group of buckets.values()) {
      if (group.length < 2) continue;
      if (listOverlaps(group)) return true;
    }
    return false;
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
        slots.push(buildSlotDaily(node, day));
        continue;
      }
      if (!isRecurringOnDay(rule, day)) continue;
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
          slots.push(buildSlotDaily(node, day));
          continue;
        }
        if (!isRecurringOnDay(rule, day)) continue;
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
