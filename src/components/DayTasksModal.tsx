import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { buildBreadcrumbs, getDeadlineColor, formatDeadline } from '../utils';
import { getNode } from '../db';
import { FiX, FiPlus, FiCheck } from 'react-icons/fi';

interface DayTasksModalProps {
  date: Date;
  tasks: Node[];
  currentNodeId: string;
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onCreateTask?: (date: Date) => void; // Обработчик создания задачи с датой
  onClose: () => void;
}

export function DayTasksModal({ date, tasks, currentNodeId, onNavigate, onMarkCompleted, onCreateTask, onClose }: DayTasksModalProps) {
  const [tasksWithBreadcrumbs, setTasksWithBreadcrumbs] = useState<Array<{ node: Node; breadcrumbs: Node[] }>>([]);
  const [localTasks, setLocalTasks] = useState<Node[]>(tasks);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);

  // Синхронизируем локальные задачи с пропсами (если они изменятся извне)
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    const loadBreadcrumbs = async () => {
      const result: Array<{ node: Node; breadcrumbs: Node[] }> = [];

      for (const task of localTasks) {
        const breadcrumbs = await buildBreadcrumbs(task.id, getNode);
        // Исключаем сам текущий узел и саму задачу из breadcrumbs
        const currentIndex = breadcrumbs.findIndex(b => b.id === currentNodeId);
        const relevantBreadcrumbs = breadcrumbs
          .slice(currentIndex + 1)
          .filter(b => b.id !== task.id);
        result.push({ node: task, breadcrumbs: relevantBreadcrumbs });
      }

      // Сортируем по названию
      result.sort((a, b) => a.node.title.localeCompare(b.node.title));
      
      setTasksWithBreadcrumbs(result);
    };

    loadBreadcrumbs();
  }, [localTasks, currentNodeId]);

  const handleToggleCompleted = (taskId: string, completed: boolean) => {
    // Обновляем локально для мгновенной реакции
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t));
    // Вызываем родительский обработчик
    onMarkCompleted(taskId, completed);
  };

  // Обработка ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    clickStartRef.current = {
      target: e.target,
      inside: modalRef.current?.contains(e.target as unknown as globalThis.Node) || false
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (clickStartRef.current && !clickStartRef.current.inside) {
      const endedInside = modalRef.current?.contains(e.target as unknown as globalThis.Node) || false;
      if (!endedInside) {
        onClose();
      }
    }
    clickStartRef.current = null;
  };

  const dateStr = date.toLocaleDateString('ru-RU', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const handleTaskClick = (taskId: string) => {
    onNavigate(taskId);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col m-4"
        style={{
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-700 bg-accent/5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100" style={{ color: 'var(--accent)' }}>
            {dateStr}
          </h2>
          <div
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 cursor-pointer"
            aria-label="Закрыть"
            role="button"
          >
            <FiX className="w-5 h-5" />
          </div>
        </div>

        {/* Список задач */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {tasksWithBreadcrumbs.length === 0 ? (
              onCreateTask ? (
                <div
                  onClick={() => {
                    onCreateTask(date);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  style={{
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                  }}
                  role="button"
                >
                  <FiPlus className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium text-gray-700 dark:text-gray-300" style={{ color: 'var(--accent)' }}>
                    Создать задачу
                  </span>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  Нет задач на этот день
                </p>
              )
            ) : (
              <>
                {tasksWithBreadcrumbs.map(({ node: task, breadcrumbs }) => {
                const deadlineColor = getDeadlineColor(task);
                const dateStr = formatDeadline(task.deadline);

                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task.id)}
                    className="w-full text-left p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer"
                    style={{
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                    }}
                    role="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Breadcrumbs */}
                          {breadcrumbs.length > 0 && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 opacity-60 mb-0.5 truncate">
                              {breadcrumbs.map((b, idx) => (
                                <span key={b.id}>
                                  {b.title}
                                  {idx < breadcrumbs.length - 1 && ' / '}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {task.title}
                          </span>
                        </div>
                      </div>
                      {dateStr && (
                        <span
                          className="text-xs px-2 py-1 rounded text-white flex-shrink-0 self-center font-normal"
                          style={{ backgroundColor: deadlineColor }}
                        >
                          {dateStr}
                        </span>
                      )}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCompleted(task.id, !task.completed);
                        }}
                        className={`p-3 sm:p-2 rounded-lg transition-all border hover:brightness-150 flex-shrink-0 cursor-pointer ${
                          task.completed
                            ? 'border-transparent'
                            : 'border-current hover:bg-accent/10'
                        }`}
                        style={{ 
                          color: 'var(--accent)',
                          backgroundColor: task.completed ? 'var(--accent)' : 'transparent'
                        }}
                        title={task.completed ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
                        role="button"
                      >
                        <FiCheck size={20} className="sm:w-4 sm:h-4" style={{ color: task.completed ? 'white' : 'var(--accent)' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Кнопка создания задачи в конце списка */}
              {onCreateTask && (
                <div
                  onClick={() => {
                    onCreateTask(date);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all flex items-center gap-2 cursor-pointer"
                  style={{
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                  }}
                  role="button"
                >
                  <FiPlus className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium text-gray-900 dark:text-gray-100" style={{ color: 'var(--accent)' }}>
                    Создать задачу
                  </span>
                </div>
              )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

