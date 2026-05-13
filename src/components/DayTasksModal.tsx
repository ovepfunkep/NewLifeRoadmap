import { useState, useEffect, useRef } from 'react';
import { Node, NodeRecurrence } from '../types';
import { buildBreadcrumbs } from '../utils';
import { getNode } from '../db';
import { FiX, FiPlus } from 'react-icons/fi';
import { Z_MODAL } from '../config/zLayers';
import { motion } from 'framer-motion';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionDurations, motionTransitions } from '../config/motion';
import { DeadlineTaskRow } from './DeadlineTaskRow';

interface DayTasksModalProps {
  date: Date;
  tasks: Node[];
  currentNodeId: string;
  onNavigate: (id: string) => void;
  onNavigateToTask?: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onCreateTask?: (date: Date, recurringPreset?: NodeRecurrence) => void; // Обработчик создания задачи с датой/пресетом
  onClose: () => void;
}

function DayTasksModal({
  date,
  tasks,
  currentNodeId,
  onNavigate,
  onNavigateToTask,
  onMarkCompleted,
  onCreateTask,
  onClose,
}: DayTasksModalProps) {
  const { allowEssentialMotion } = useMotionPreferences();
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

      // Как в списке дедлайнов: по времени дедлайна (при равенстве — по названию)
      result.sort((a, b) => {
        const ta = a.node.deadline ? new Date(a.node.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.node.deadline ? new Date(b.node.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return a.node.title.localeCompare(b.node.title);
      });
      
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

  // ESC в capture: глобальные hotkeys NodePage тоже на window, но в bubble и зарегистрированы раньше — иначе ESC уходит в «к родителю»
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
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
    onNavigateToTask?.(taskId);
    onClose();
  };

  return (
    <motion.div 
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: Z_MODAL }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={
        allowEssentialMotion
          ? motionTransitions.fade
          : { duration: motionDurations.fast }
      }
    >
      <motion.div
        ref={modalRef}
        className="m-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800 lg:rounded-xl"
        style={{
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
        onMouseDown={(e) => e.stopPropagation()}
        initial={allowEssentialMotion ? { y: 18, scale: 0.98, opacity: 0.92 } : { opacity: 1 }}
        animate={allowEssentialMotion ? { y: 0, scale: 1, opacity: 1 } : { opacity: 1 }}
        exit={allowEssentialMotion ? { y: 18, scale: 0.98, opacity: 0 } : { opacity: 0 }}
        transition={
          allowEssentialMotion
            ? motionTransitions.modal
            : { duration: motionDurations.fast }
        }
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
                {tasksWithBreadcrumbs.map(({ node: task, breadcrumbs }) => (
                  <DeadlineTaskRow
                    key={task.id}
                    task={task}
                    breadcrumbs={breadcrumbs}
                    onOpen={() => handleTaskClick(task.id)}
                    onToggleCompleted={(id, completed) => handleToggleCompleted(id, completed)}
                  />
                ))}
              {/* Кнопка создания задачи в конце списка */}
              {onCreateTask && (
                <div
                  onClick={() => {
                    onCreateTask(date);
                    onClose();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-gray-50 p-3 text-left transition-all hover:bg-gray-200/85 dark:bg-gray-700/50 dark:hover:bg-gray-600/55"
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
      </motion.div>
    </motion.div>
  );
}

export { DayTasksModal };
export default DayTasksModal;

