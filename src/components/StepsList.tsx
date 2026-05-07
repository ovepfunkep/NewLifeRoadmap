import { useEffect, useMemo, useState } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { NodeCard } from './NodeCard';
import { Tooltip } from './Tooltip';
import { FiCalendar, FiSliders } from 'react-icons/fi';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useEffects } from '../hooks/useEffects';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionTransitions } from '../config/motion';

type SortType = 'none' | 'name' | 'deadline';
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
  sortType: SortType;
  onSortChange: (sort: SortType) => void;
  filterType: FilterType;
  onFilterChange: (filter: FilterType) => void;
  currentNodeId?: string;
  animatingBurnId?: string | null;
  animatingMoveId?: string | null;
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
  onSortChange,
  filterType,
  onFilterChange,
  currentNodeId,
  animatingBurnId,
  animatingMoveId
}: StepsListProps) {
  const { effectsEnabled } = useEffects();
  const { allowDecorativeMotion } = useMotionPreferences();
  const [isMobile, setIsMobile] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);

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

  const filteredChildren = useMemo(() => {
    return children.filter(child => {
      if (filterType === 'all') return true;
      if (filterType === 'completed') return child.completed;
      if (filterType === 'incomplete') return !child.completed;
      return true;
    });
  }, [children, filterType]);

  const sortedChildren = useMemo(() => {
    return [...filteredChildren].sort((a, b) => {
      if (a.priority && !b.priority) return -1;
      if (!a.priority && b.priority) return 1;
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;

      if (sortType === 'name') {
        return a.title.localeCompare(b.title);
      }
      if (sortType === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }

      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [filteredChildren, sortType]);

  const filterChips: Array<{ key: FilterType; label: string; count: number }> = [
    { key: 'all', label: t('filter.all'), count: counts.all },
    { key: 'completed', label: t('filter.completed'), count: counts.completed },
    { key: 'incomplete', label: t('filter.incomplete'), count: counts.incomplete },
  ];

  const sortOptions: Array<{ key: SortType; label: string }> = [
    { key: 'deadline', label: t('sort.byDeadline') },
    { key: 'name', label: t('sort.byName') },
    { key: 'none', label: t('sort.defaultOrder') },
  ];

  return (
    <>
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100 md:text-xl">
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
          ) : (
            <div className="flex min-h-9 shrink-0 items-center gap-1">
              {sortOptions.map((option) => (
                <Tooltip key={option.key} text={option.label}>
                  <button
                    type="button"
                    onClick={() => onSortChange(option.key)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all ${
                      sortType === option.key
                        ? 'border-transparent text-white'
                        : 'border-current'
                    }`}
                    style={{
                      color: sortType === option.key ? 'white' : 'var(--accent)',
                      backgroundColor: sortType === option.key ? 'var(--accent)' : 'transparent',
                    }}
                  >
                    {option.key === 'deadline' ? <FiCalendar size={13} /> : option.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 min-h-9">
          <LayoutGroup id="steps-filter-chips">
          <div className="flex min-h-9 min-w-0 items-center gap-1 overflow-x-auto custom-scrollbar">
            {filterChips.map((chip) => {
              const active = filterType === chip.key;
              return (
                <motion.button
                  key={chip.key}
                  type="button"
                  onClick={() => onFilterChange(chip.key)}
                  className={`relative flex items-center gap-1 rounded-full border-0 px-3 py-1.5 text-xs font-semibold shadow-none ring-0 transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                    active
                      ? 'text-white'
                      : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200'
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
                    className={`relative z-10 min-w-[1.8rem] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-[#F4F4F6] text-gray-700 dark:bg-[#2e2e34] dark:text-gray-200'
                    }`}
                  >
                    {chip.count}
                  </span>
                </motion.button>
              );
            })}
          </div>
          </LayoutGroup>
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
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
                    active
                      ? 'text-white shadow-lg shadow-accent/20'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                  style={active ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </MobileBottomSheet>
    </>
  );
}

