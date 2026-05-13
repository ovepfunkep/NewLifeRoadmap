import { useState, useEffect, useMemo } from 'react';
import { Node, NodeRecurrence } from '../types';
import { t } from '../i18n';
import { collectDeadlines, sortByDeadlineAsc, buildBreadcrumbs, walkSubtree } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { getNode } from '../db';
import { FiList, FiCalendar, FiClock } from 'react-icons/fi';
import { CalendarView } from './CalendarView';
import DayTasksModal from './DayTasksModal';
import { DeadlineTaskRow } from './DeadlineTaskRow';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { expandNodesToSlots, RecurringScheduleSlot } from '../utils/recurrence';
import { WeekScheduleView } from './WeekScheduleView';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionTransitions } from '../config/motion';

interface DeadlineListProps {
  node: Node;
  onNavigate: (id: string) => void;
  onNavigateToTask?: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onCreateTask?: (date: Date, recurringPreset?: NodeRecurrence) => void; // Создание задачи с датой и optional пресетом регулярности
}

// Проверка, является ли дедлайн прошедшим
function isPastDeadline(deadline: string): boolean {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dDate = new Date(deadlineDate);
  dDate.setHours(0, 0, 0, 0);
  return dDate < now;
}

// Проверка, является ли дедлайн срочным (в ближайшую неделю)
function isUrgentDeadline(deadline: string): boolean {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

// Группировка дедлайнов: возвращаем все задачи с минимальным дедлайном для каждого первого уровня дочерних узлов
// Для срочных дедлайнов (ближайшая неделя) показываем ВСЕ дедлайны из ветки, игнорируя правило "1 ветка - 1 правило"
// Учитываем как сам шаг первого уровня, так и все его подшаги
function groupDeadlines(node: Node): Node[] {
  const result: Node[] = [];
  
  // Для каждого первого уровня дочерних узлов находим все задачи с минимальным дедлайном
  for (const child of node.children) {
    // Проверяем дедлайн самого шага первого уровня
    const childHasDeadline = child.deadline && !child.completed;
    
    // Собираем все дедлайны из поддерева (включая сам шаг)
    const allDeadlines: Node[] = [];
    if (childHasDeadline && !isPastDeadline(child.deadline!)) {
      allDeadlines.push(child);
    }
    
    // Добавляем дедлайны из поддерева, исключая прошедшие
    const subtreeDeadlines = collectDeadlines(child).filter(dl => 
      !dl.completed && 
      dl.deadline && 
      !isPastDeadline(dl.deadline)
    );
    allDeadlines.push(...subtreeDeadlines);
    
    if (allDeadlines.length === 0) continue;
    
    // Сортируем и находим минимальный дедлайн
    const sorted = sortByDeadlineAsc(allDeadlines);
    const minDeadline = sorted[0]?.deadline;
    
    if (!minDeadline) continue;
    
    // Проверяем, есть ли срочные дедлайны в этой ветке
    const urgentDeadlines = sorted.filter(task => 
      task.deadline && isUrgentDeadline(task.deadline)
    );
    
    if (urgentDeadlines.length > 0) {
      // Если есть срочные дедлайны - добавляем ВСЕ срочные дедлайны из этой ветки
      result.push(...urgentDeadlines);
    } else {
      // Иначе применяем стандартную логику: находим все задачи с минимальным дедлайном
      const minDeadlineTime = new Date(minDeadline).getTime();
      const tasksWithMinDeadline = sorted.filter(task => 
        task.deadline && new Date(task.deadline).getTime() === minDeadlineTime
      );
      
      // Добавляем все задачи с минимальным дедлайном
      result.push(...tasksWithMinDeadline);
    }
  }
  
  // Убираем дубликаты по ID
  const seenIds = new Set<string>();
  return result.filter(task => {
    if (seenIds.has(task.id)) {
      return false;
    }
    seenIds.add(task.id);
    return true;
  });
}

export function DeadlineList({ node, onNavigate, onNavigateToTask, onMarkCompleted, onCreateTask }: DeadlineListProps) {
  useDeadlineTicker(); // подписка на тикер
  const { allowDecorativeMotion } = useMotionPreferences();
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'week'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('deadlineViewMode');
      return (stored === 'list' || stored === 'calendar' || stored === 'week') ? stored : 'list';
    }
    return 'list';
  });
  const [deadlinesWithBreadcrumbs, setDeadlinesWithBreadcrumbs] = useState<Array<{ node: Node; breadcrumbs: Node[] }>>([]);
  const [selectedDay, setSelectedDay] = useState<{ date: Date; tasks: Node[] } | null>(null);
  const [groupedDeadlines, setGroupedDeadlines] = useState<Node[]>([]);
  const [allDeadlines, setAllDeadlines] = useState<Node[]>([]); // Все задачи с дедлайнами для календаря
  const [scheduleNodes, setScheduleNodes] = useState<Node[]>([]);
  const [weekStartDate, setWeekStartDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [weekShiftDirection, setWeekShiftDirection] = useState<-1 | 0 | 1>(0);

  useEffect(() => {
    const grouped = groupDeadlines(node);
    setGroupedDeadlines(grouped);
    
    // Для календаря собираем ВСЕ задачи с дедлайнами (незавершенные)
    const allTasksWithDeadlines: Node[] = [];
    
    // Добавляем сам узел, если у него есть дедлайн
    if (node.deadline && !node.completed) {
      allTasksWithDeadlines.push(node);
    }
    
    // Собираем все дедлайны из поддерева
    const subtreeDeadlines = collectDeadlines(node).filter(dl => !dl.completed && dl.deadline);
    allTasksWithDeadlines.push(...subtreeDeadlines);
    
    // Убираем дубликаты по ID
    const seenIds = new Set<string>();
    const uniqueDeadlines = allTasksWithDeadlines.filter(task => {
      if (seenIds.has(task.id)) {
        return false;
      }
      seenIds.add(task.id);
      return true;
    });
    
    setAllDeadlines(uniqueDeadlines);

    const allScheduleNodes: Node[] = [];
    walkSubtree(node, (task) => {
      if (task.completed || task.deletedAt) return;
      if ((task.isRecurring && task.recurrence) || task.deadline) {
        allScheduleNodes.push(task);
      }
    });

    const seenScheduleIds = new Set<string>();
    const uniqueSchedule = allScheduleNodes.filter((task) => {
      if (seenScheduleIds.has(task.id)) return false;
      seenScheduleIds.add(task.id);
      return true;
    });
    setScheduleNodes(uniqueSchedule);
  }, [node]);

  const recurringSlots = useMemo<RecurringScheduleSlot[]>(
    () => expandNodesToSlots(scheduleNodes, weekStartDate, 7),
    [scheduleNodes, weekStartDate]
  );

  const handleShiftWeekWindow = (offsetDays: number) => {
    if (!offsetDays) return;
    setWeekShiftDirection(offsetDays > 0 ? 1 : -1);
    setWeekStartDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + offsetDays);
      return next;
    });
  };

  const handleResetWeekWindow = () => {
    setWeekShiftDirection(0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setWeekStartDate(now);
  };

  useEffect(() => {
    const loadBreadcrumbs = async () => {
      const result: Array<{ node: Node; breadcrumbs: Node[] }> = [];

      for (const deadlineNode of groupedDeadlines) {
        const breadcrumbs = await buildBreadcrumbs(deadlineNode.id, getNode);
        // Исключаем сам текущий узел и саму задачу из breadcrumbs
        // Оставляем только путь от текущего узла до задачи
        const currentIndex = breadcrumbs.findIndex(b => b.id === node.id);
        const relevantBreadcrumbs = breadcrumbs
          .slice(currentIndex + 1)
          .filter(b => b.id !== deadlineNode.id);
        result.push({ node: deadlineNode, breadcrumbs: relevantBreadcrumbs });
      }
      
      // Сортируем по дате дедлайна
      result.sort((a, b) => {
        if (!a.node.deadline || !b.node.deadline) return 0;
        return new Date(a.node.deadline).getTime() - new Date(b.node.deadline).getTime();
      });
      
      setDeadlinesWithBreadcrumbs(result);
    };
    
    if (viewMode === 'list') {
      loadBreadcrumbs();
    }
  }, [node, groupedDeadlines, viewMode]);

  const handleDayClick = (date: Date, tasks: Node[]) => {
    setSelectedDay({ date, tasks });
  };

  useEffect(() => {
    localStorage.setItem('deadlineViewMode', viewMode);
  }, [viewMode]);

  // Определяем компактный режим для больших экранов в календарном виде
  const [isCompact, setIsCompact] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkCompact = () => {
      setIsCompact(viewMode === 'calendar' && window.innerWidth >= 1024);
    };
    
    checkCompact();
    window.addEventListener('resize', checkCompact);
    return () => window.removeEventListener('resize', checkCompact);
  }, [viewMode]);

  return (
    <>
      <div
        className={`flex min-h-[140px] flex-col py-4 transition-all md:p-5 ${
          isMobile ? '' : 'rounded-lg bg-white shadow-sm lg:rounded-xl dark:bg-gray-800'
        }`}
      >
        {/* Режимы дедлайнов: под календарь — больше воздуха; список/неделя — как у перечня задач (mb-4 после переключателя) */}
        <div
          className={`flex flex-col gap-3 flex-shrink-0 ${
            viewMode === 'calendar' ? 'mb-5' : 'mb-4'
          }`}
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 md:text-[20px]">
            {t('deadline.title')}
          </h2>
          <LayoutGroup id="deadline-view-chips">
          <div
            className={`mt-1 flex w-full items-center gap-2 rounded-xl p-1 ${
              isMobile
                ? 'bg-white shadow-sm dark:bg-gray-800'
                : 'bg-[var(--surface-subtle)] dark:bg-gray-900/55'
            }`}
          >
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 relative transition-all ${
                viewMode === 'list'
                  ? 'text-white'
                  : 'opacity-80 hover:opacity-100'
              }`}
              aria-label="Вид списка"
              style={{
                color: viewMode === 'list' ? 'white' : 'var(--accent)'
              }}
            >
              {viewMode === 'list' && allowDecorativeMotion && (
                <motion.span
                  layoutId="deadline-view-active-indicator"
                  className="absolute inset-0 rounded-xl"
                  style={{ backgroundColor: 'var(--accent)' }}
                  transition={motionTransitions.itemSpring}
                />
              )}
              {!allowDecorativeMotion && viewMode === 'list' && (
                <span className="absolute inset-0 rounded-xl" style={{ backgroundColor: 'var(--accent)' }} />
              )}
              <span className="relative z-10 flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold">
                <FiList className="h-4 w-4" />
                <span>{t('deadline.listLabel')}</span>
              </span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex-1 relative transition-all ${
                viewMode === 'calendar'
                  ? 'text-white'
                  : 'opacity-80 hover:opacity-100'
              }`}
              aria-label="Вид календаря"
              style={{
                color: viewMode === 'calendar' ? 'white' : 'var(--accent)'
              }}
            >
              {viewMode === 'calendar' && allowDecorativeMotion && (
                <motion.span
                  layoutId="deadline-view-active-indicator"
                  className="absolute inset-0 rounded-xl"
                  style={{ backgroundColor: 'var(--accent)' }}
                  transition={motionTransitions.itemSpring}
                />
              )}
              {!allowDecorativeMotion && viewMode === 'calendar' && (
                <span className="absolute inset-0 rounded-xl" style={{ backgroundColor: 'var(--accent)' }} />
              )}
              <span className="relative z-10 flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold">
                <FiCalendar className="h-4 w-4" />
                <span>{t('deadline.calendarLabel')}</span>
              </span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex-1 relative transition-all ${
                viewMode === 'week'
                  ? 'text-white'
                  : 'opacity-80 hover:opacity-100'
              }`}
              aria-label="Вид недели"
              style={{
                color: viewMode === 'week' ? 'white' : 'var(--accent)'
              }}
            >
              {viewMode === 'week' && allowDecorativeMotion && (
                <motion.span
                  layoutId="deadline-view-active-indicator"
                  className="absolute inset-0 rounded-xl"
                  style={{ backgroundColor: 'var(--accent)' }}
                  transition={motionTransitions.itemSpring}
                />
              )}
              {!allowDecorativeMotion && viewMode === 'week' && (
                <span className="absolute inset-0 rounded-xl" style={{ backgroundColor: 'var(--accent)' }} />
              )}
              <span className="relative z-10 flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold">
                <FiClock className="h-4 w-4" />
                <span>{t('deadline.weekLabel')}</span>
              </span>
            </button>
          </div>
          </LayoutGroup>
        </div>

        {/* Контент в зависимости от вида */}
        <div className="flex-1 relative min-h-0">
          <AnimatePresence mode="wait" initial={false}>
            {viewMode === 'list' ? (
            <motion.div
              key="deadline-list-view"
              initial={allowDecorativeMotion ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={allowDecorativeMotion ? { opacity: 0, y: -8 } : { opacity: 0 }}
              transition={motionTransitions.fade}
              className="relative h-full flex flex-col"
            >
              <div
                className={`space-y-3 overflow-y-auto px-1 custom-scrollbar ${
                  isMobile ? 'flex-1 min-h-0 py-1' : 'max-h-[435px] py-0'
                }`}
              >
                <AnimatePresence mode="popLayout">
                  {deadlinesWithBreadcrumbs.map(({ node: dl, breadcrumbs }) => (
                      <motion.div
                        key={dl.id}
                        initial={allowDecorativeMotion ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={allowDecorativeMotion ? { opacity: 0, scale: 0.95 } : { opacity: 0 }}
                        transition={motionTransitions.fade}
                        className="w-full"
                      >
                        <DeadlineTaskRow
                          task={dl}
                          breadcrumbs={breadcrumbs}
                          onOpen={() => {
                            onNavigate(dl.id);
                            onNavigateToTask?.(dl.id);
                          }}
                          onToggleCompleted={onMarkCompleted}
                        />
                      </motion.div>
                    ))}
                </AnimatePresence>
                {deadlinesWithBreadcrumbs.length === 0 && (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('deadline.noActiveFuture')}
                  </p>
                )}
              </div>
            </motion.div>
          ) : viewMode === 'calendar' ? (
            <motion.div
              key="deadline-calendar-view"
              initial={allowDecorativeMotion ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={allowDecorativeMotion ? { opacity: 0, y: -8 } : { opacity: 0 }}
              transition={motionTransitions.fade}
              className="relative"
            >
              <CalendarView
                node={node}
                deadlines={allDeadlines}
                onNavigate={onNavigate}
                onDayClick={handleDayClick}
                onCreateTask={onCreateTask}
                compact={isCompact}
              />
            </motion.div>
          ) : (
            <motion.div
              key="deadline-week-view"
              initial={allowDecorativeMotion ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={allowDecorativeMotion ? { opacity: 0, y: -8 } : { opacity: 0 }}
              transition={motionTransitions.fade}
            >
              <WeekScheduleView
                slots={recurringSlots}
                startDate={weekStartDate}
                shiftDirection={weekShiftDirection}
                onShiftDays={handleShiftWeekWindow}
                onResetToday={handleResetWeekWindow}
                onNavigate={onNavigate}
                onNavigateToTask={onNavigateToTask}
                onCreateTask={onCreateTask}
              />
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      {/* Модалка со списком задач на день */}
      {selectedDay && (
        <DayTasksModal
          date={selectedDay.date}
          tasks={selectedDay.tasks}
          currentNodeId={node.id}
          onNavigate={onNavigate}
          onNavigateToTask={onNavigateToTask}
          onMarkCompleted={onMarkCompleted}
          onCreateTask={onCreateTask}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  );
}

