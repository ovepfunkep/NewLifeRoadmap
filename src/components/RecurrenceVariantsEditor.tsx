import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight, FiClock, FiPlus, FiTrash2 } from 'react-icons/fi';
import type { RecurrenceScheduleVariant } from '../types';
import { t } from '../i18n';
import { motionDurations, motionEasing } from '../config/motion';
import { openNativeDateTimePickerFromOverlay } from '../utils/nativeDateTimePicker';
import { useLanguage } from '../contexts/LanguageContext';

const MAX_VARIANTS = 12;

export interface RecurrenceVariantsEditorProps {
  frequency: 'weekly' | 'monthly' | 'yearly';
  variants: RecurrenceScheduleVariant[];
  onVariantsChange: (next: RecurrenceScheduleVariant[]) => void;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  isMobile: boolean;
  allowEssentialMotion: boolean;
  weekdayOptions: { value: number; label: string }[];
}

function pageLabel(current: number, total: number) {
  return t('editor.recurrencePageOf').replace('{current}', String(current)).replace('{total}', String(total));
}

export function RecurrenceVariantsEditor({
  frequency,
  variants,
  onVariantsChange,
  activeIndex,
  onActiveIndexChange,
  isMobile,
  allowEssentialMotion,
  weekdayOptions,
}: RecurrenceVariantsEditorProps) {
  const { language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRaf = useRef<number | null>(null);
  const pendingProgrammaticScroll = useRef(false);
  const [navDir, setNavDir] = useState(0);

  const markProgrammaticScroll = () => {
    pendingProgrammaticScroll.current = true;
  };

  const patchVariant = useCallback(
    (pageIndex: number, patch: Partial<RecurrenceScheduleVariant>) => {
      onVariantsChange(variants.map((v, i) => (i === pageIndex ? { ...v, ...patch } : v)));
    },
    [variants, onVariantsChange]
  );

  const toggleWeekday = (pageIndex: number, day: number) => {
    const v = variants[pageIndex];
    const cur = v.weekdays ?? [];
    const next = cur.includes(day) ? cur.filter((x) => x !== day) : [...cur, day];
    patchVariant(pageIndex, { weekdays: next });
  };

  const toggleMonthDay = (pageIndex: number, day: number) => {
    const v = variants[pageIndex];
    const cur = v.monthDays ?? [];
    const next = cur.includes(day) ? cur.filter((x) => x !== day) : [...cur, day];
    patchVariant(pageIndex, { monthDays: next });
  };

  const addVariant = () => {
    if (variants.length >= MAX_VARIANTS) return;
    const blank: RecurrenceScheduleVariant =
      frequency === 'weekly'
        ? { weekdays: [], timeStart: '', timeEnd: '' }
        : frequency === 'monthly'
          ? { monthDays: [], timeStart: '', timeEnd: '' }
          : {
              yearlyMonth: variants[variants.length - 1]?.yearlyMonth ?? new Date().getMonth() + 1,
              yearlyMonthDay: variants[variants.length - 1]?.yearlyMonthDay ?? new Date().getDate(),
              timeStart: '',
              timeEnd: '',
            };
    markProgrammaticScroll();
    onVariantsChange([...variants, blank]);
    setNavDir(1);
    onActiveIndexChange(variants.length);
  };

  const removeVariant = () => {
    if (variants.length <= 1) return;
    markProgrammaticScroll();
    const next = variants.filter((_, i) => i !== activeIndex);
    onVariantsChange(next);
    onActiveIndexChange(Math.min(activeIndex, next.length - 1));
  };

  /** Удаление страницы по индексу (кнопка на конкретном слайде на мобилке). */
  const removeVariantAt = (pageIndex: number) => {
    if (variants.length <= 1) return;
    markProgrammaticScroll();
    const next = variants.filter((_, i) => i !== pageIndex);
    onVariantsChange(next);
    const newIdx = pageIndex >= next.length ? next.length - 1 : pageIndex;
    onActiveIndexChange(newIdx);
  };

  const goPrev = () => {
    if (activeIndex <= 0) return;
    markProgrammaticScroll();
    setNavDir(-1);
    onActiveIndexChange(activeIndex - 1);
  };

  const goNext = () => {
    if (activeIndex >= variants.length - 1) return;
    markProgrammaticScroll();
    setNavDir(1);
    onActiveIndexChange(activeIndex + 1);
  };

  const scheduleScrollRead = useCallback(() => {
    if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      const i = Math.round(el.scrollLeft / w);
      if (i !== activeIndex && i >= 0 && i < variants.length) {
        onActiveIndexChange(i);
      }
    });
  }, [activeIndex, variants.length, onActiveIndexChange]);

  useEffect(() => {
    return () => {
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isMobile || !scrollRef.current) return;
    const el = scrollRef.current;
    const w = el.clientWidth;
    if (w <= 0) return;
    const target = activeIndex * w;
    if (pendingProgrammaticScroll.current) {
      pendingProgrammaticScroll.current = false;
      el.scrollTo({ left: target, behavior: 'auto' });
      return;
    }
    // Смена страницы от свайпа: не трогаем scrollLeft (избегаем дёрганья).
    if (Math.abs(el.scrollLeft - target) < w * 0.35) return;
    el.scrollTo({ left: target, behavior: 'auto' });
  }, [activeIndex, isMobile, variants.length]);

  const goToPageFromDots = (i: number) => {
    markProgrammaticScroll();
    onActiveIndexChange(i);
  };

  const renderDaysAndTime = (pageIndex: number) => {
    const v = variants[pageIndex];
    if (frequency === 'weekly') {
      return (
        <>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('editor.recurrenceWeekdays')}</p>
          <div className="grid grid-cols-7 gap-1">
            {weekdayOptions.map((day) => {
              const active = (v.weekdays ?? []).includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleWeekday(pageIndex, day.value)}
                  className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                    active
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-300 bg-gray-200/80 dark:bg-gray-700/70'
                  }`}
                  style={active ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </>
      );
    }

    if (frequency === 'yearly') {
      const ym = v.yearlyMonth ?? new Date().getMonth() + 1;
      const ymd = v.yearlyMonthDay ?? new Date().getDate();
      return (
        <>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('editor.recurrenceYearDate')}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                {t('editor.recurrenceYearMonth')}
              </span>
              <select
                value={ym}
                onChange={(e) => patchVariant(pageIndex, { yearlyMonth: Number(e.target.value) })}
                className="h-[48px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 text-sm text-gray-900 transition-all dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {language === 'ru'
                      ? new Date(2024, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long' })
                      : new Date(2024, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                {t('editor.recurrenceYearDay')}
              </span>
              <input
                type="number"
                min={1}
                max={31}
                value={ymd}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  patchVariant(pageIndex, {
                    yearlyMonthDay: Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : 1,
                  });
                }}
                className="h-[48px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 text-sm text-gray-900 transition-all dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
          </div>
        </>
      );
    }

    return (
      <>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('editor.recurrenceMonthDays')}</p>
        <div className="grid grid-cols-8 gap-1 max-h-28 overflow-y-auto pr-1">
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
            const active = (v.monthDays ?? []).includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleMonthDay(pageIndex, day)}
                className={`rounded-md py-1 text-[11px] font-semibold transition-all ${
                  active
                    ? 'text-white'
                    : 'text-gray-600 dark:text-gray-300 bg-gray-200/80 dark:bg-gray-700/70'
                }`}
                style={active ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                {day}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const renderTimeRow = (pageIndex: number) => {
    const v = variants[pageIndex];
    const startId = `recVarTimeStart-${pageIndex}`;
    const endId = `recVarTimeEnd-${pageIndex}`;
    return (
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] text-gray-500 dark:text-gray-400">{t('editor.recurrenceTimeStart')}</span>
          <div
            className="relative h-[48px]"
            onPointerDownCapture={(ev) => openNativeDateTimePickerFromOverlay(ev.currentTarget, ev)}
          >
            <div className="pointer-events-none flex h-full w-full items-center overflow-hidden whitespace-nowrap rounded-xl bg-gray-50 px-2 py-3 pl-10 text-sm text-gray-900 transition-all dark:bg-gray-900 dark:text-gray-100">
              {v.timeStart || <span className="text-gray-400 dark:text-gray-600">{t('editor.time')}</span>}
            </div>
            <FiClock className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-accent" size={18} />
            <input
              id={startId}
              type="time"
              value={v.timeStart || ''}
              onChange={(e) => patchVariant(pageIndex, { timeStart: e.target.value })}
              lang={language === 'ru' ? 'ru-RU' : 'en-US'}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              aria-label={t('editor.recurrenceTimeStart')}
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] text-gray-500 dark:text-gray-400">{t('editor.timeEndOptional')}</span>
          <div
            className="relative h-[48px]"
            onPointerDownCapture={(ev) => openNativeDateTimePickerFromOverlay(ev.currentTarget, ev)}
          >
            <div className="pointer-events-none flex h-full w-full items-center overflow-hidden whitespace-nowrap rounded-xl bg-gray-50 px-2 py-3 pl-10 text-sm text-gray-900 transition-all dark:bg-gray-900 dark:text-gray-100">
              {v.timeEnd || <span className="text-gray-400 dark:text-gray-600">{t('editor.time')}</span>}
            </div>
            <FiClock className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-accent" size={18} />
            <input
              id={endId}
              type="time"
              value={v.timeEnd || ''}
              onChange={(e) => patchVariant(pageIndex, { timeEnd: e.target.value })}
              lang={language === 'ru' ? 'ru-RU' : 'en-US'}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              aria-label={t('editor.timeEndOptional')}
            />
          </div>
        </label>
      </div>
    );
  };

  const renderMobileTimeRowWithActions = (pageIndex: number) => {
    const v = variants[pageIndex];
    const startId = `recVarTimeStart-${pageIndex}`;
    const endId = `recVarTimeEnd-${pageIndex}`;
    return (
      <div className="flex items-stretch gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          <label className="min-w-0 space-y-0.5">
            <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400">
              {t('editor.recurrenceTimeStart')}
            </span>
            <div
              className="relative h-10"
              onPointerDownCapture={(ev) => openNativeDateTimePickerFromOverlay(ev.currentTarget, ev)}
            >
              <div className="pointer-events-none flex h-full w-full items-center overflow-hidden whitespace-nowrap rounded-lg bg-gray-50 pl-8 pr-1.5 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                {v.timeStart || <span className="text-gray-400 dark:text-gray-600">{t('editor.time')}</span>}
              </div>
              <FiClock className="pointer-events-none absolute left-2 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-accent" />
              <input
                id={startId}
                type="time"
                value={v.timeStart || ''}
                onChange={(e) => patchVariant(pageIndex, { timeStart: e.target.value })}
                lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                aria-label={t('editor.recurrenceTimeStart')}
              />
            </div>
          </label>
          <label className="min-w-0 space-y-0.5">
            <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400">
              {t('editor.timeEndOptional')}
            </span>
            <div
              className="relative h-10"
              onPointerDownCapture={(ev) => openNativeDateTimePickerFromOverlay(ev.currentTarget, ev)}
            >
              <div className="pointer-events-none flex h-full w-full items-center overflow-hidden whitespace-nowrap rounded-lg bg-gray-50 pl-8 pr-1.5 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                {v.timeEnd || <span className="text-gray-400 dark:text-gray-600">{t('editor.time')}</span>}
              </div>
              <FiClock className="pointer-events-none absolute left-2 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-accent" />
              <input
                id={endId}
                type="time"
                value={v.timeEnd || ''}
                onChange={(e) => patchVariant(pageIndex, { timeEnd: e.target.value })}
                lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                aria-label={t('editor.timeEndOptional')}
              />
            </div>
          </label>
        </div>
        <div className="flex min-h-0 w-10 shrink-0 flex-col gap-1 self-stretch">
          <button
            type="button"
            onClick={addVariant}
            disabled={variants.length >= MAX_VARIANTS}
            title={variants.length >= MAX_VARIANTS ? t('editor.recurrenceMaxVariants') : t('editor.recurrenceAddVariant')}
            className={`flex w-full min-h-0 items-center justify-center rounded-lg bg-gray-100 text-accent hover:bg-gray-200/90 disabled:opacity-40 dark:bg-gray-700/60 dark:hover:bg-gray-600/60 ${
              variants.length > 1 ? 'flex-1 basis-0' : 'flex-1'
            }`}
            aria-label={t('editor.recurrenceAddVariant')}
          >
            <FiPlus size={16} />
          </button>
          {variants.length > 1 && (
            <button
              type="button"
              onClick={() => removeVariantAt(pageIndex)}
              className="flex min-h-0 w-full flex-1 basis-0 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100/90 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
              aria-label={t('editor.recurrenceRemoveVariant')}
            >
              <FiTrash2 size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const controlsRow = (
    <div className={`flex flex-wrap items-center gap-2 ${isMobile ? 'justify-end' : 'justify-between'}`}>
      {!isMobile && (
        <span className="text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
          {pageLabel(activeIndex + 1, variants.length)}
        </span>
      )}
      <div className="flex items-center gap-1">
        {!isMobile && (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIndex <= 0}
              className="rounded-lg bg-gray-100 p-1.5 transition-colors hover:bg-gray-200/90 disabled:opacity-30 dark:bg-gray-700/60 dark:hover:bg-gray-600/60"
              aria-label={t('editor.recurrencePrevPage')}
            >
              <FiChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={activeIndex >= variants.length - 1}
              className="rounded-lg bg-gray-100 p-1.5 transition-colors hover:bg-gray-200/90 disabled:opacity-30 dark:bg-gray-700/60 dark:hover:bg-gray-600/60"
              aria-label={t('editor.recurrenceNextPage')}
            >
              <FiChevronRight size={18} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={addVariant}
          disabled={variants.length >= MAX_VARIANTS}
          title={variants.length >= MAX_VARIANTS ? t('editor.recurrenceMaxVariants') : t('editor.recurrenceAddVariant')}
          className="rounded-lg bg-gray-100 p-1.5 text-accent transition-colors hover:bg-gray-200/90 disabled:opacity-40 dark:bg-gray-700/60 dark:hover:bg-gray-600/60"
          aria-label={t('editor.recurrenceAddVariant')}
        >
          <FiPlus size={18} />
        </button>
        {variants.length > 1 && (
          <button
            type="button"
            onClick={removeVariant}
            className="rounded-lg bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100/90 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/45"
            aria-label={t('editor.recurrenceRemoveVariant')}
          >
            <FiTrash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-1.5">
        <div
          ref={scrollRef}
          onScroll={scheduleScrollRead}
          className="-mx-1 flex touch-pan-x snap-x snap-mandatory overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {variants.map((_, pageIndex) => (
            <div
              key={pageIndex}
              className="min-w-full shrink-0 snap-center snap-always space-y-1.5 px-1"
            >
              {renderDaysAndTime(pageIndex)}
              {renderMobileTimeRowWithActions(pageIndex)}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-1.5 pt-0.5" role="tablist" aria-label={t('editor.recurrenceTitle')}>
          {variants.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              onClick={() => goToPageFromDots(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {controlsRow}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeIndex}
          initial={allowEssentialMotion ? { opacity: 0, x: navDir >= 0 ? 14 : -14 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={allowEssentialMotion ? { opacity: 0, x: navDir >= 0 ? -14 : 14 } : undefined}
          transition={{ duration: motionDurations.fast, ease: motionEasing.standard }}
          className="space-y-2"
        >
          {renderDaysAndTime(activeIndex)}
          {renderTimeRow(activeIndex)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
