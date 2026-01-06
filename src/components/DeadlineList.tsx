import { useState, useEffect } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { collectDeadlines, sortByDeadlineAsc, getDeadlineColor, buildBreadcrumbs, formatDeadline } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { getNode } from '../db';
import { FiList, FiCalendar } from 'react-icons/fi';
import { CalendarView } from './CalendarView';
import { DayTasksModal } from './DayTasksModal';
import { motion, AnimatePresence } from 'framer-motion';

interface DeadlineListProps {
  node: Node;
  onNavigate: (id: string) => void;
  onCreateTask?: (date: Date) => void; // Обработчик создания задачи с датой
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

export function DeadlineList({ node, onNavigate, onCreateTask }: DeadlineListProps) {
  useDeadlineTicker(); // подписка на тикер
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('deadlineViewMode');
      return (stored === 'list' || stored === 'calendar') ? stored : 'list';
    }
    return 'list';
  });
  const [deadlinesWithBreadcrumbs, setDeadlinesWithBreadcrumbs] = useState<Array<{ node: Node; breadcrumbs: Node[] }>>([]);
  const [selectedDay, setSelectedDay] = useState<{ date: Date; tasks: Node[] } | null>(null);
  const [groupedDeadlines, setGroupedDeadlines] = useState<Node[]>([]);
  const [allDeadlines, setAllDeadlines] = useState<Node[]>([]); // Все задачи с дедлайнами для календаря

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
  }, [node]);

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
    if (typeof window === 'undefined') return;
    
    const checkCompact = () => {
      setIsCompact(viewMode === 'calendar' && window.innerWidth >= 1024);
    };
    
    checkCompact();
    window.addEventListener('resize', checkCompact);
    return () => window.removeEventListener('resize', checkCompact);
  }, [viewMode]);

  const hasDeadlines = groupedDeadlines.length > 0;

  return (
    <>
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-5 min-h-[140px] flex flex-col transition-all"
        style={{
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)'
        }}
      >
        {/* Заголовок с тумблером */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('deadline.title')}
          </h2>
          {hasDeadlines && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-700">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'shadow-sm'
                    : 'opacity-60 hover:opacity-100'
                }`}
                aria-label="Вид списка"
                style={{
                  backgroundColor: viewMode === 'list' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'list' ? 'white' : 'var(--accent)'
                }}
              >
                <FiList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'calendar'
                    ? 'shadow-sm'
                    : 'opacity-60 hover:opacity-100'
                }`}
                aria-label="Вид календаря"
                style={{
                  backgroundColor: viewMode === 'calendar' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'calendar' ? 'white' : 'var(--accent)'
                }}
              >
                <FiCalendar className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Контент в зависимости от вида */}
        <div className="flex-1 relative min-h-0">
          {!hasDeadlines ? (
            <div className="flex flex-col items-center justify-center py-6 h-full text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                {node.children.length > 0 ? t('deadline.noDeadlinesNested') : t('deadline.noDeadlines')}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="relative h-full flex flex-col">
              {/* Permanent top fade */}
              <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white dark:from-gray-800 to-transparent z-10 pointer-events-none" />
              
              <div className="space-y-3 max-h-[435px] overflow-y-auto py-4 px-1 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {deadlinesWithBreadcrumbs.map(({ node: dl, breadcrumbs }) => {
                    const dateStr = formatDeadline(dl.deadline);
                    const deadlineColor = getDeadlineColor(dl);
                    
                    return (
                      <motion.button
                        key={dl.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => onNavigate(dl.id)}
                        className="w-full text-left p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 transition-all min-h-[64px] hover:shadow-md"
                        style={{
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Breadcrumbs - мелким шрифтом, полупрозрачным, над названием */}
                              {breadcrumbs.length > 0 && (
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 opacity-60 mb-0.5 truncate font-normal">
                                  {breadcrumbs.map((b, idx) => (
                                    <span key={b.id}>
                                      {b.title}
                                      {idx < breadcrumbs.length - 1 && ' / '}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {dl.title}
                              </span>
                            </div>
                          </div>
                          <span
                            className="text-xs px-2 py-1 rounded flex-shrink-0 self-center font-normal"
                            style={{ 
                              backgroundColor: deadlineColor,
                              color: deadlineColor === '#eab308' ? 'black' : 'white'
                            }}
                          >
                            {dateStr}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
              
              {/* Permanent bottom fade */}
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-800 to-transparent z-10 pointer-events-none" />
            </div>
          ) : (
            <div 
              className={isCompact ? '' : 'max-h-[70vh] overflow-y-auto custom-scrollbar'}
              style={isCompact ? {} : {
                overflowAnchor: 'none'
              }}
            >
              <CalendarView
                node={node}
                deadlines={allDeadlines}
                onNavigate={onNavigate}
                onDayClick={handleDayClick}
                onCreateTask={onCreateTask}
                compact={isCompact}
              />
            </div>
          )}
        </div>
      </div>

      {/* Модалка со списком задач на день */}
      {selectedDay && (
        <DayTasksModal
          date={selectedDay.date}
          tasks={selectedDay.tasks}
          currentNodeId={node.id}
          onNavigate={onNavigate}
          onCreateTask={onCreateTask}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  );
}

