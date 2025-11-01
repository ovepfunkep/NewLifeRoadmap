import { Node } from '../types';
import { t } from '../i18n';
import { collectDeadlines, sortByDeadlineAsc, getDeadlineColor } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';

interface DeadlineListProps {
  node: Node;
  onNavigate: (id: string) => void;
}

export function DeadlineList({ node, onNavigate }: DeadlineListProps) {
  useDeadlineTicker(); // подписка на тикер
  // Фильтруем только незавершённые задачи
  const allDeadlines = collectDeadlines(node).filter(dl => !dl.completed);
  const deadlines = sortByDeadlineAsc(allDeadlines);

  if (deadlines.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {t('deadline.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('deadline.noDeadlines')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        {t('deadline.title')}
      </h2>
      <div className="space-y-2">
        {deadlines.map((dl) => {
          const dateStr = dl.deadline ? new Date(dl.deadline).toLocaleDateString('ru-RU') : '';
          const deadlineColor = getDeadlineColor(dl);
          
          return (
            <button
              key={dl.id}
              onClick={() => onNavigate(dl.id)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:shadow-sm transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {dl.title}
                </span>
                <span
                  className="text-xs px-2 py-1 rounded text-white"
                  style={{ backgroundColor: deadlineColor }}
                >
                  {dateStr}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

