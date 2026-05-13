import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { t } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { RecurringScheduleSlot, getRollingDays } from '../utils/recurrence';
import { NodeRecurrence } from '../types';
import { motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight, FiRotateCw } from 'react-icons/fi';
import { useMotionPreferences } from '../hooks/useMotionPreferences';

interface WeekScheduleViewProps {
  slots: RecurringScheduleSlot[];
  startDate?: Date;
  shiftDirection?: -1 | 0 | 1;
  onShiftDays?: (offsetDays: number) => void;
  onResetToday?: () => void;
  onCreateTask?: (date: Date, recurringPreset?: NodeRecurrence) => void;
  onNavigate?: (taskId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
}

interface TimedSlotLayout {
  slot: RecurringScheduleSlot;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Подпись недели как в календаре: «18–25 мая»; год — только если не текущий. */
function getWeekRangeLabel(start: Date, end: Date, lang: string): string {
  const a = new Date(start);
  a.setHours(0, 0, 0, 0);
  const b = new Date(end);
  b.setHours(0, 0, 0, 0);
  const y = b.getFullYear();
  const thisYear = new Date().getFullYear();
  const showYear = y !== thisYear || a.getFullYear() !== thisYear;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (lang === 'ru') {
    const m = b.toLocaleDateString('ru-RU', { month: 'long' });
    if (sameMonth) {
      return showYear ? `${a.getDate()}–${b.getDate()} ${m} ${y} г.` : `${a.getDate()}–${b.getDate()} ${m}`;
    }
    const ma = a.toLocaleDateString('ru-RU', { month: 'long' });
    const mb = b.toLocaleDateString('ru-RU', { month: 'long' });
    return showYear
      ? `${a.getDate()} ${ma} — ${b.getDate()} ${mb} ${b.getFullYear()} г.`
      : `${a.getDate()} ${ma} — ${b.getDate()} ${mb}`;
  }
  if (sameMonth) {
    const month = b.toLocaleDateString('en-US', { month: 'long' });
    return showYear ? `${month} ${a.getDate()}–${b.getDate()}, ${y}` : `${month} ${a.getDate()}–${b.getDate()}`;
  }
  const left = a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const right = b.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return showYear ? `${left} – ${right}, ${b.getFullYear()}` : `${left} – ${right}`;
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

function buildStableTaskColor(taskId: string): string {
  const hash = hashString(taskId);
  // Golden-angle hue distribution gives visually separated colors for nearby ids.
  const hue = Math.floor((hash * 137.508) % 360);
  const saturation = 68 + (hash % 18); // 68..85
  const lightness = 45 + ((hash >> 4) % 11); // 45..55
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function toTransparentFill(color: string, opacityPercent = 58): string {
  return `color-mix(in srgb, ${color} ${opacityPercent}%, transparent)`;
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
  onNavigateToTask,
}: WeekScheduleViewProps) {
  const { allowDecorativeMotion } = useMotionPreferences();
  const { language } = useLanguage();
  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const days = useMemo(() => getRollingDays(startDate, 7), [startDate]);
  const weekKey = useMemo(() => days[0]?.toISOString() ?? 'week', [days]);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setViewportHeight(window.innerHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const timelineHeight = useMemo(() => {
    if (!isMobile) return 530;
    if (!viewportHeight) return 260;
    return Math.max(220, Math.min(360, viewportHeight - 470));
  }, [isMobile, viewportHeight]);

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
      value.sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
      grouped.set(key, value);
    }

    return grouped;
  }, [days, slots]);

  const colorByTaskId = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueIds = Array.from(new Set(slots.map((slot) => slot.taskId)));

    uniqueIds.forEach((taskId) => {
      // Stable and diverse color: depends only on taskId.
      map.set(taskId, buildStableTaskColor(taskId));
    });
    return map;
  }, [slots]);

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
    for (let hour = 0; hour <= 24; hour += 1) {
      marks.push(hour * 60);
    }
    return marks;
  }, []);

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

  const handleTaskTap = (taskId: string) => {
    onNavigate?.(taskId);
    onNavigateToTask?.(taskId);
  };

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const isWeekAnchoredToday = useMemo(() => {
    const anchor = new Date(startDate);
    anchor.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return anchor.getTime() === today.getTime();
  }, [startDate]);

  const weekRangeLabel = useMemo(() => {
    const first = days[0];
    const last = days[6] ?? first;
    if (!first || !last) return '';
    return getWeekRangeLabel(first, last, language);
  }, [days, language]);

  const navBtnClass =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-accent transition-colors hover:bg-gray-100 dark:bg-gray-900/55 dark:hover:bg-gray-800/80';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug text-gray-900 dark:text-gray-100">
          {weekRangeLabel}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {!isWeekAnchoredToday && onResetToday && (
            <>
              <button
                type="button"
                onClick={onResetToday}
                className={`${navBtnClass} md:hidden`}
                style={{ color: 'var(--accent)' }}
                title={t('schedule.toCurrentWeek')}
                aria-label={t('schedule.toCurrentWeek')}
              >
                <FiRotateCw size={18} />
              </button>
              <button
                type="button"
                onClick={onResetToday}
                className="hidden max-w-[42vw] truncate rounded-lg px-2 py-2 text-left text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 md:inline-flex md:max-w-[min(280px,40vw)] md:text-sm dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-200"
                title={t('schedule.toCurrentWeek')}
                aria-label={t('schedule.toCurrentWeek')}
              >
                {t('schedule.toCurrentWeek')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onShiftDays?.(-1)}
            className={navBtnClass}
            style={{ color: 'var(--accent)' }}
            title={t('schedule.previousDay')}
            aria-label={t('schedule.previousDay')}
          >
            <FiChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => onShiftDays?.(1)}
            className={navBtnClass}
            style={{ color: 'var(--accent)' }}
            title={t('schedule.nextDay')}
            aria-label={t('schedule.nextDay')}
          >
            <FiChevronRight size={20} />
          </button>
        </div>
      </div>

      <motion.div
        key={weekKey}
        initial={allowDecorativeMotion ? { opacity: 0, x: shiftDirection > 0 ? 22 : shiftDirection < 0 ? -22 : 0 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={allowDecorativeMotion ? { duration: 0.16 } : { duration: 0.12 }}
        className="relative"
      >
        <div className="grid grid-cols-8 gap-2">
          <div className="flex flex-col space-y-2">
            <div className="min-h-[48px] shrink-0" aria-hidden />
            <div className="relative shrink-0" style={{ height: `${timelineHeight}px` }}>
              {timelineMarks.map((minutes) => (
                <div
                  key={minutes}
                  className="absolute left-0 right-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums leading-none"
                  style={{ top: `${(minutes / (24 * 60)) * 100}%`, transform: 'translateY(-50%)' }}
                >
                  {!isMobile || minutes % 120 === 0 ? formatMinutes(minutes) : ''}
                </div>
              ))}
            </div>
          </div>

          {days.map((day) => {
          const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const isToday = dayKey === todayKey;
          const weekendWash =
            isWeekend && !isToday
              ? {
                  backgroundColor: 'rgba(var(--accent-rgb), 0.08)',
                  borderColor: 'rgba(var(--accent-rgb), 0.28)',
                }
              : undefined;
          const daySlots = slotsByDay.get(dayKey) ?? [];
          const timedSlots = daySlots.filter((slot) => !slot.isAllDay);
          const timedLayouts = buildTimedLayouts(timedSlots);
          const laneGapPercent = 1.8;

          return (
            <div
              key={dayKey}
              className={`space-y-2 rounded-lg border-2 lg:rounded-xl ${isToday ? '' : 'border-transparent'}`}
              style={isToday ? { borderColor: 'var(--accent)' } : undefined}
            >
              <div
                className={`relative flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center px-0.5 text-center text-[10px] font-bold ${
                  isWeekend && !isToday ? '' : 'text-gray-500 dark:text-gray-400'
                }`}
                style={isWeekend && !isToday ? { color: 'var(--accent)' } : undefined}
              >
                <div className="w-full max-w-full text-center uppercase tracking-wide leading-none">
                  {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short' })}
                </div>
                <div
                  className={`mt-0.5 w-full max-w-full text-center text-[10px] font-medium tabular-nums tracking-normal normal-case leading-none ${
                    isWeekend && !isToday ? 'opacity-90' : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' })}
                </div>
              </div>

              <div
                className={`relative overflow-hidden rounded-lg bg-gray-50/90 shadow-sm dark:bg-gray-900/55 lg:rounded-xl ${onCreateTask ? 'cursor-copy' : ''}`}
                onClick={(event) => handleCreateFromTimeline(day, event)}
                style={{
                  height: `${timelineHeight}px`,
                  ...weekendWash,
                }}
              >
                {timelineMarks.map((minutes) => (
                  <div
                    key={`${dayKey}-${minutes}`}
                    className={`absolute left-0 right-0 border-t ${
                      minutes % 120 === 0
                        ? 'border-gray-200/70 dark:border-gray-700/60'
                        : 'border-gray-200/40 dark:border-gray-700/40'
                    }`}
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
                        handleTaskTap(layout.slot.taskId);
                      }}
                      className="absolute rounded-md shadow-sm hover:brightness-110 transition-all"
                      style={{
                        top: `${Math.max(0, top)}%`,
                        height: `${height}%`,
                        left: `${left}%`,
                        width: `${laneWidth}%`,
                        backgroundColor: toTransparentFill(color, 58),
                        border: `1px solid ${color}`,
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
            </div>
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
                  onClick={() => handleTaskTap(item.taskId)}
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
