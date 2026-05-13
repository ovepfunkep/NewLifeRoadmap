import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { compareChildNodesForListSort, type StepsSortType } from '../utils';
import { NodeCard } from './NodeCard';
import { Tooltip } from './Tooltip';
import { FiArrowDown, FiArrowUp, FiCalendar, FiPlus, FiSliders, FiType } from 'react-icons/fi';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useEffects } from '../hooks/useEffects';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionTransitions } from '../config/motion';

type FilterType = 'all' | 'completed' | 'incomplete';

interface StepsListProps {
  children: Node[];
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onEdit: (node: Node) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (id: string, priority: boolean) => void;
  onMove?: (node: Node) => void;
  onDragStart?: (node: Node) => void;
  onDragEnd?: () => void;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
  draggedNode?: Node | null;
  dragOverNodeId?: string | null;
  sortType: StepsSortType;
  sortAscending: boolean;
  onSortChange: (sort: StepsSortType) => void;
  filterType: FilterType;
  onFilterChange: (filter: FilterType) => void;
  currentNodeId?: string;
  animatingBurnId?: string | null;
  animatingMoveId?: string | null;
  /** Desktop: plus in header row; mobile uses FAB on NodePage */
  onAddStep?: () => void;
}

export function StepsList({ 
  children, 
  onNavigate, 
  onMarkCompleted, 
  onEdit, 
  onDelete,
  onTogglePriority,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  draggedNode,
  dragOverNodeId,
  sortType,
  sortAscending,
  onSortChange,
  filterType,
  onFilterChange,
  currentNodeId,
  animatingBurnId,
  animatingMoveId,
  onAddStep,
}: StepsListProps) {
  const { effectsEnabled } = useEffects();
  const { allowDecorativeMotion } = useMotionPreferences();
  const [isMobile, setIsMobile] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const filterScrollRef = useRef<HTMLDivElement>(null);
  const [filterScrollFade, setFilterScrollFade] = useState({ left: false, right: false });

  const updateFilterScrollFade = useCallback(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 2;
    setFilterScrollFade({
      left: overflow && scrollLeft > 3,
      right: overflow && scrollLeft < scrollWidth - clientWidth - 3,
    });
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const counts = useMemo(() => {
    const total = children.length;
    const completed = children.filter(child => child.completed).length;
    return {
      all: total,
      completed,
      incomplete: total - completed,
    };
  }, [children]);

  useEffect(() => {
    updateFilterScrollFade();
    const el = filterScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateFilterScrollFade());
    ro.observe(el);
    el.addEventListener('scroll', updateFilterScrollFade, { passive: true });
    window.addEventListener('resize', updateFilterScrollFade);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateFilterScrollFade);
      window.removeEventListener('resize', updateFilterScrollFade);
    };
  }, [updateFilterScrollFade, children.length, counts.all, counts.completed, counts.incomplete]);

  useEffect(() => {
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(updateFilterScrollFade);
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [updateFilterScrollFade, filterType]);

  const filteredChildren = useMemo(() => {
    return children.filter(child => {
      if (filterType === 'all') return true;
      if (filterType === 'completed') return child.completed;
      if (filterType === 'incomplete') return !child.completed;
      return true;
    });
  }, [children, filterType]);

  const sortedChildren = useMemo(() => {
    return [...filteredChildren].sort((a, b) =>
      compareChildNodesForListSort(a, b, sortType, sortAscending),
    );
  }, [filteredChildren, sortType, sortAscending]);

  const filterChips: Array<{ key: FilterType; label: string; count: number }> = [
    { key: 'all', label: t('filter.all'), count: counts.all },
    { key: 'incomplete', label: t('filter.incomplete'), count: counts.incomplete },
    { key: 'completed', label: t('filter.completed'), count: counts.completed },
  ];

  const sortOptions: Array<{ key: StepsSortType; label: string }> = [
    { key: 'deadline', label: t('sort.byDeadline') },
    { key: 'name', label: t('sort.byName') },
  ];

  return (
    <>
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100 md:text-[20px]">
            {t('node.steps') || 'Задачи'}
          </h2>
          {isMobile ? (
            <Tooltip text={t('sort.openOptions')}>
              <motion.button
                type="button"
                onClick={() => setShowSortSheet(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current transition-all hover:bg-accent/10"
                style={{
                  color: 'var(--accent)',
                }}
                whileTap={allowDecorativeMotion ? { scale: 0.95 } : undefined}
              >
                <FiSliders size={15} />
              </motion.button>
            </Tooltip>
          ) : onAddStep ? (
            <Tooltip text={t('node.createChild')}>
              <button
                type="button"
                onClick={onAddStep}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-all hover:brightness-110"
                style={{ backgroundColor: 'var(--accent)' }}
                aria-label={t('node.createChild')}
              >
                <FiPlus size={20} />
              </button>
            </Tooltip>
          ) : null}
        </div>

        <div className="mb-4 flex min-h-9 min-w-0 items-center gap-2">
          <div className="relative min-h-9 min-w-0 flex-1">
            <LayoutGroup id="steps-filter-chips">
              <div
                ref={filterScrollRef}
                className="flex min-h-9 min-w-0 items-center gap-1 overflow-x-auto custom-scrollbar"
              >
            {filterChips.map((chip) => {
              const active = filterType === chip.key;
              return (
                <motion.button
                  key={chip.key}
                  type="button"
                  onClick={() => onFilterChange(chip.key)}
                  className={`relative flex shrink-0 items-center gap-1 rounded-full border-0 px-[10px] py-1.5 text-xs font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                    active
                      ? 'text-white'
                      : 'bg-[var(--surface-subtle)] text-gray-800 hover:bg-gray-50 dark:bg-gray-700/80 dark:text-gray-100 dark:hover:bg-gray-600/85'
                  }`}
                  style={{
                    backgroundColor: active && !allowDecorativeMotion ? 'var(--accent)' : undefined,
                  }}
                  whileTap={allowDecorativeMotion ? { scale: 0.97 } : undefined}
                >
                  {active && allowDecorativeMotion && (
                    <motion.span
                      layoutId="steps-filter-active-chip"
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                      transition={motionTransitions.itemSpring}
                    />
                  )}
                  <span className="relative z-10 min-w-0 truncate">{chip.label}</span>
                  <span
                    className={`relative z-10 min-w-[26px] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums tracking-tighter ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-gray-700 dark:bg-black/25 dark:text-gray-100'
                    }`}
                  >
                    {chip.count}
                  </span>
                </motion.button>
              );
            })}
              </div>
            </LayoutGroup>
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 dark:from-gray-800 ${
                filterScrollFade.left ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
            />
            <div
              className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 dark:from-gray-800 ${
                filterScrollFade.right ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
            />
          </div>
          {!isMobile && (
            <div className="flex min-h-9 shrink-0 items-center gap-1">
              {sortOptions.map((option) => {
                const active = sortType === option.key;
                const tip = active
                  ? `${option.label} — ${sortAscending ? t('sort.ascending') : t('sort.descending')}`
                  : option.label;
                return (
                  <Tooltip key={option.key} text={tip}>
                    <button
                      type="button"
                      onClick={() => onSortChange(option.key)}
                      className={`relative flex shrink-0 items-center gap-1.5 rounded-full border-0 px-[10px] py-1.5 text-xs font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                        active
                          ? 'text-white'
                          : 'bg-[var(--surface-subtle)] text-gray-800 hover:bg-gray-50 dark:bg-gray-700/80 dark:text-gray-100 dark:hover:bg-gray-600/85'
                      }`}
                      style={{
                        ...(active ? { color: 'white', backgroundColor: 'var(--accent)' } : {}),
                      }}
                    >
                      {option.key === 'deadline' ? (
                        <FiCalendar className="shrink-0" size={14} aria-hidden />
                      ) : option.key === 'name' ? (
                        <FiType className="shrink-0" size={14} aria-hidden />
                      ) : null}
                      <span className="relative z-10 whitespace-nowrap">{option.label}</span>
                      {active ? (
                        sortAscending ? (
                          <FiArrowUp className="shrink-0 opacity-95" size={14} aria-hidden />
                        ) : (
                          <FiArrowDown className="shrink-0 opacity-95" size={14} aria-hidden />
                        )
                      ) : null}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        {children.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-gray-500 dark:text-gray-400">
            {t('node.noChildren')}
          </p>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false} mode="popLayout">
              {sortedChildren.map((child, index) => (
                <motion.div
                  key={child.id}
                  className="[content-visibility:auto] [contain-intrinsic-size:auto_5rem]"
                  layout={effectsEnabled ? 'position' : false}
                  initial={effectsEnabled ? { opacity: 0, scale: 0.95, y: 14 } : false}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    effectsEnabled
                      ? { opacity: 0, scale: 0.92, transition: motionTransitions.fade }
                      : { opacity: 0 }
                  }
                  transition={motionTransitions.itemSpring}
                >
                  <NodeCard
                    node={child}
                    index={index}
                    onNavigate={onNavigate}
                    onMarkCompleted={onMarkCompleted}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onTogglePriority={onTogglePriority}
                    onMove={onMove}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    isDragOver={dragOverNodeId === child.id && (!currentNodeId || child.id !== currentNodeId)}
                    draggedNode={draggedNode}
                    currentNodeId={currentNodeId}
                    isBurning={animatingBurnId === child.id}
                    isMovingOut={animatingMoveId === child.id}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <MobileBottomSheet
        isOpen={showSortSheet && isMobile}
        title={t('sort.openOptions')}
        onClose={() => setShowSortSheet(false)}
      >
        <div className="max-h-[80vh] overflow-y-auto px-1 pb-1">
          <div className="space-y-2">
            {sortOptions.map((option) => {
              const active = sortType === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    onSortChange(option.key);
                    setShowSortSheet(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
                    active
                      ? 'text-white'
                      : 'bg-[var(--surface-subtle)] text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                  style={active ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {option.key === 'deadline' ? (
                      <FiCalendar className="shrink-0" size={16} aria-hidden />
                    ) : option.key === 'name' ? (
                      <FiType className="shrink-0" size={16} aria-hidden />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {active ? (
                    sortAscending ? (
                      <FiArrowUp className="shrink-0" size={18} aria-hidden />
                    ) : (
                      <FiArrowDown className="shrink-0" size={18} aria-hidden />
                    )
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </MobileBottomSheet>
    </>
  );
}

