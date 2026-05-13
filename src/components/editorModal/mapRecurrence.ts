import type { NodeRecurrence, RecurrenceScheduleVariant } from '../../types';
import { normalizeRecurrenceVariants } from '../../utils/recurrence';

/** Maps persisted recurrence into editor variant rows for weekly/monthly/yearly. */
export function mapNodeRecurrenceToVariants(
  rule: NodeRecurrence,
  freq: 'weekly' | 'monthly' | 'yearly'
): RecurrenceScheduleVariant[] {
  const list = normalizeRecurrenceVariants(rule);
  if (freq === 'weekly') {
    return list.map((v) => ({
      weekdays: [...(v.weekdays ?? [])],
      timeStart: v.timeStart ?? '',
      timeEnd: v.timeEnd ?? '',
    }));
  }
  if (freq === 'monthly') {
    return list.map((v) => ({
      monthDays: [...(v.monthDays ?? [])],
      timeStart: v.timeStart ?? '',
      timeEnd: v.timeEnd ?? '',
    }));
  }
  return list.map((v) => ({
    yearlyMonth: v.yearlyMonth ?? 1,
    yearlyMonthDay: v.yearlyMonthDay ?? 1,
    timeStart: v.timeStart ?? '',
    timeEnd: v.timeEnd ?? '',
  }));
}
