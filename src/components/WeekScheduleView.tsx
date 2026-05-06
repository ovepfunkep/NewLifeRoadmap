import { useMemo, type MouseEvent } from 'react';
import { t } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { RecurringScheduleSlot, getRollingDays } from '../utils/recurrence';
import { NodeRecurrence } from '../types';
import { useAccent } from '../hooks/useAccent';
import { motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight, FiRotateCw } from 'react-icons/fi';

interface WeekScheduleViewProps {
  slots: RecurringScheduleSlot[];
  startDate?: Date;
  shiftDirection?: -1 | 0 | 1;
  onShiftDays?: (offsetDays: number) => void;
  onResetToday?: () => void;
  onCreateTask?: (date: Date, recurringPreset?: NodeRecurrence) => void;
  onNavigate?: (taskId: string) => void;
}

interface TimedSlotLayout {
  slot: RecurringScheduleSlot;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
}

const CONTRAST_PRIORITY = [
  '#2563eb', // blue
  '#ea580c', // orange
  '#16a34a', // green
  '#ec4899', // pink
  '#0891b2', // cyan
  '#dc2626', // red
  '#ca8a04', // yellow
  '#9333ea', // purple
];

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toTimeInput(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildTimedLayouts(slots: RecurringScheduleSlot[]): TimedSlotLayout[] {
  const sorted = [...slots]
    .map((slot) => {
      const start = slot.startMinutes ?? 0;
      const fallbackEnd = Math.min(start + 30, 24 * 60);
      const end = slot.endMinutes && slot.endMinutes > start ? slot.endMinutes : fallbackEnd;
      return { slot, start, end };
    })
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });

  const active: Array<{ end: number; lane: number; resultIndex: number }> = [];
  const result: TimedSlotLayout[] = [];
  let clusterIndices: number[] = [];
  let clusterMaxLanes = 1;

  const finalizeCluster = () => {
    if (clusterIndices.length === 0) return;
    for (const index of clusterIndices) {
      result[index].laneCount = clusterMaxLanes;
    }
    clusterIndices = [];
    clusterMaxLanes = 1;
  };

  for (const item of sorted) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= item.start) {
        active.splice(i, 1);
      }
    }

    if (active.length === 0) {
      finalizeCluster();
    }

    const occupied = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (occupied.has(lane)) {
      lane += 1;
    }

    const resultIndex = result.length;
    result.push({
      slot: item.slot,
      start: item.start,
      end: item.end,
      lane,
      laneCount: 1,
    });
    active.push({ end: item.end, lane, resultIndex });
    clusterIndices.push(resultIndex);
    clusterMaxLanes = Math.max(clusterMaxLanes, lane + 1);
  }

  finalizeCluster();
  return result;
}

export function WeekScheduleView({
  slots,
  startDate = new Date(),
  shiftDirection = 0,
  onShiftDays,
  onResetToday,
  onCreateTask,
  onNavigate,
}: WeekScheduleViewProps) {
  const { language } = useLanguage();
  const { colors: accentColors } = useAccent();
  const days = useMemo(() => getRollingDays(startDate, 7), [startDate]);
  const weekKey = useMemo(() => days[0]?.toISOString() ?? 'week', [days]);
  const hasAnySlots = slots.length > 0;

  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, RecurringScheduleSlot[]>();
    for (const day of days) {
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      grouped.set(key, []);
    }

    for (const slot of slots) {
      if (!grouped.has(slot.dayKey)) continue;
      grouped.get(slot.dayKey)!.push(slot);
    }

    for (const [key, value] of grouped.entries()) {
      value.sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
        return (a.startMinutes ?? 0) - (b.startMinutes ?? 0);
      });
      grouped.set(key, value);
    }

    return grouped;
  }, [days, slots]);

  const contrastPalette = useMemo(() => {
    const fromSettings = accentColors.filter(Boolean);
    const prioritized = CONTRAST_PRIORITY.filter((color) => fromSettings.includes(color));
    const fallback = fromSettings.filter((color) => !prioritized.includes(color));
    const merged = [...prioritized, ...fallback];
    return merged.length > 0 ? merged : CONTRAST_PRIORITY;
  }, [accentColors]);

  const colorByTaskId = useMemo(() => {
    const map = new Map<string, string>();
    const paletteSize = contrastPalette.length;
    if (paletteSize === 0) return map;
    const uniqueIds = Array.from(new Set(slots.map((slot) => slot.taskId)));

    uniqueIds.forEach((taskId) => {
      // Stable color: depends only on taskId, not on current visible slot list.
      map.set(taskId, contrastPalette[hashString(taskId) % paletteSize] || 'var(--accent)');
    });
    return map;
  }, [slots, contrastPalette]);

  const legendItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ taskId: string; title: string; color: string }> = [];
    for (const slot of slots) {
      if (seen.has(slot.taskId)) continue;
      seen.add(slot.taskId);
      items.push({
        taskId: slot.taskId,
        title: slot.title,
        color: colorByTaskId.get(slot.taskId) || 'var(--accent)',
      });
    }
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }, [slots, colorByTaskId]);

  const timelineMarks = useMemo(() => {
    const marks: number[] = [];
    for (let hour = 0; hour <= 24; hour += 2) {
      marks.push(hour * 60);
    }
    return marks;
  }, []);

  const hasAnyAllDay = useMemo(() => slots.some((slot) => slot.isAllDay), [slots]);

  const handleCreateFromTimeline = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    if (!onCreateTask) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / rect.height));
    const rawMinutes = Math.floor(ratio * 24 * 60);
    const snappedStart = Math.max(0, Math.min(23 * 60, Math.floor(rawMinutes / 60) * 60));
    const snappedEnd = Math.min(snappedStart + 60, 23 * 60 + 59);

    const slotDate = new Date(day);
    slotDate.setHours(Math.floor(snappedStart / 60), snappedStart % 60, 0, 0);

    onCreateTask(slotDate, {
      freq: 'weekly',
      weekdays: [day.getDay()],
      timeStart: toTimeInput(snappedStart),
      timeEnd: toTimeInput(snappedEnd),
    });
  };

  return (
    <div className="space-y-3">
      {!hasAnySlots && (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('schedule.weekEmpty')}
        </div>
      )}

      <motion.div
        key={weekKey}
        initial={{ opacity: 0, x: shiftDirection > 0 ? 36 : shiftDirection < 0 ? -36 : 0 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22 }}
        className="relative"
      >
        <div className="mb-1 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onShiftDays?.(-1)}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--accent)' }}
            title={t('schedule.previousDay')}
            aria-label={t('schedule.previousDay')}
          >
            <FiChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={onResetToday}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--accent)' }}
            title={t('schedule.today')}
            aria-label={t('schedule.today')}
          >
            <FiRotateCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => onShiftDays?.(1)}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--accent)' }}
            title={t('schedule.nextDay')}
            aria-label={t('schedule.nextDay')}
          >
            <FiChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-8 gap-2">
          <div className="px-1" />
          {days.map((day, idx) => (
            <div
              key={day.toISOString()}
              className="relative px-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              style={idx === 0 ? { color: 'var(--accent)' } : undefined}
            >
              <div className="text-center">
                <div>{day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short' })}</div>
                <div className="text-[11px] normal-case font-medium text-gray-600 dark:text-gray-300">
                  {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-8 gap-2">
          <div className="space-y-2">
            <div className={hasAnyAllDay ? 'min-h-[42px]' : 'min-h-[8px]'} />
            <div className="relative h-[530px]">
              {timelineMarks.map((minutes) => (
                <div
                  key={minutes}
                  className="absolute left-0 right-0 text-[10px] text-gray-400 dark:text-gray-500"
                  style={{ top: `${(minutes / (24 * 60)) * 100}%`, transform: 'translateY(-50%)' }}
                >
                  {formatMinutes(minutes)}
                </div>
              ))}
            </div>
          </div>

          {days.map((day, dayIndex) => {
          const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const daySlots = slotsByDay.get(dayKey) ?? [];
          const allDaySlots = daySlots.filter((slot) => slot.isAllDay);
          const timedSlots = daySlots.filter((slot) => !slot.isAllDay);
          const timedLayouts = buildTimedLayouts(timedSlots);
          const laneGapPercent = 1.8;

          return (
            <motion.div
              key={dayKey}
              className="space-y-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: dayIndex * 0.03 }}
            >
              <div className={`${hasAnyAllDay ? 'min-h-[42px]' : 'min-h-[8px]'} space-y-1`}>
                {allDaySlots.map((slot) => (
                  <motion.button
                    type="button"
                    key={`${slot.taskId}-${slot.dayKey}-allday`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onNavigate?.(slot.taskId);
                    }}
                    className="w-full h-2.5 rounded-md transition-colors hover:brightness-110"
                    style={{
                      backgroundColor: colorByTaskId.get(slot.taskId) || 'var(--accent)',
                    }}
                    title={slot.title}
                    aria-label={slot.title}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18 }}
                  />
                ))}
              </div>

              <div
                className={`relative h-[530px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 overflow-hidden ${onCreateTask ? 'cursor-copy' : ''}`}
                onClick={(event) => handleCreateFromTimeline(day, event)}
              >
                {timelineMarks.map((minutes) => (
                  <div
                    key={`${dayKey}-${minutes}`}
                    className="absolute left-0 right-0 border-t border-gray-200/70 dark:border-gray-700/60"
                    style={{ top: `${(minutes / (24 * 60)) * 100}%` }}
                  />
                ))}

                {timedLayouts.map((layout) => {
                  const top = (layout.start / (24 * 60)) * 100;
                  const height = Math.max(((layout.end - layout.start) / (24 * 60)) * 100, 2.2);
                  const laneWidth = (100 - (layout.laneCount - 1) * laneGapPercent) / layout.laneCount;
                  const left = layout.lane * (laneWidth + laneGapPercent);
                  const color = colorByTaskId.get(layout.slot.taskId) || 'var(--accent)';

                  return (
                    <motion.button
                      type="button"
                      key={`${layout.slot.taskId}-${layout.slot.dayKey}-${layout.start}-${layout.end}-${layout.lane}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onNavigate?.(layout.slot.taskId);
                      }}
                      className="absolute rounded-md shadow-sm hover:brightness-110 transition-all"
                      style={{
                        top: `${Math.max(0, top)}%`,
                        height: `${height}%`,
                        left: `${left}%`,
                        width: `${laneWidth}%`,
                        backgroundColor: color,
                        border: '1px solid rgba(255,255,255,0.35)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                      }}
                      title={`${layout.slot.title} (${formatMinutes(layout.start)}-${formatMinutes(layout.end)})`}
                      aria-label={layout.slot.title}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.22 }}
                    />
                  );
                })}
              </div>
            </motion.div>
          );
          })}
        </div>

        {legendItems.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              {legendItems.map((item) => (
                <button
                  key={`legend-${item.taskId}`}
                  type="button"
                  onClick={() => onNavigate?.(item.taskId)}
                  className="inline-flex items-center gap-1.5 text-[10px] text-gray-700 dark:text-gray-200 hover:opacity-80 transition-opacity"
                  title={item.title}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="max-w-[140px] truncate">{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
