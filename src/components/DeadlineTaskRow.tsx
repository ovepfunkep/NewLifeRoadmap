import { FiCheck } from 'react-icons/fi';
import { Node } from '../types';
import { formatDeadline, getDeadlineColor } from '../utils';
import { useTranslation } from '../i18n';

export interface DeadlineTaskRowProps {
  task: Node;
  breadcrumbs: Node[];
  onOpen: () => void;
  /** Кнопка «готово» справа; без колбэка не рендерится */
  onToggleCompleted?: (taskId: string, completed: boolean) => void;
}

/** Единая строка задачи со сроком под названием и кнопкой выполнения справа (список дедлайнов, день календаря). */
export function DeadlineTaskRow({ task, breadcrumbs, onOpen, onToggleCompleted }: DeadlineTaskRowProps) {
  const t = useTranslation();
  const deadlineColor = getDeadlineColor(task);
  const dateStr =
    task.deadline !== undefined && task.deadline !== null && task.deadline !== ''
      ? formatDeadline(task.deadline, task.deadlineEnd)
      : '';

  return (
    <div className="flex w-full items-stretch gap-2 rounded-lg bg-gray-50 shadow-sm transition-all hover:bg-gray-200/85 hover:shadow dark:bg-gray-700/50 dark:hover:bg-gray-600/55">
      <button
        type="button"
        className="min-w-0 flex-1 px-3 py-3 text-left outline-none ring-inset ring-accent/35 focus-visible:ring-2"
        onClick={onOpen}
      >
        {breadcrumbs.length > 0 && (
          <div className="mb-0.5 truncate text-[10px] font-medium text-gray-400 opacity-70 dark:text-gray-500">
            {breadcrumbs.map((b, idx) => (
              <span key={b.id}>
                {b.title}
                {idx < breadcrumbs.length - 1 && ' / '}
              </span>
            ))}
          </div>
        )}
        <span className={`block font-medium text-gray-900 dark:text-gray-100 ${task.completed ? 'opacity-65 line-through' : ''}`}>
          {task.title}
        </span>
        {dateStr ? (
          <span
            className="mt-1 inline-flex max-w-full flex-wrap rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: deadlineColor }}
          >
            {dateStr}
          </span>
        ) : null}
      </button>
      {onToggleCompleted ? (
        <div className="flex shrink-0 items-center pr-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompleted(task.id, !task.completed);
            }}
            className={`cursor-pointer rounded-lg border p-3 transition-all hover:brightness-150 sm:p-2 ${
              task.completed ? 'border-transparent' : 'border-current hover:bg-accent/10'
            }`}
            style={{
              color: 'var(--accent)',
              backgroundColor: task.completed ? 'var(--accent)' : 'transparent',
            }}
            title={task.completed ? t('node.markIncomplete') : t('node.markCompleted')}
          >
            <FiCheck size={20} className="sm:h-4 sm:w-4" style={{ color: task.completed ? 'white' : 'var(--accent)' }} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
