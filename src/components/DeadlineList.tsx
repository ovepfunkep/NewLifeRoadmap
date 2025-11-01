import React from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { collectDeadlines, sortByDeadlineAsc, deadlineStatus } from '../utils';
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
          const status = deadlineStatus(dl);
          const dateStr = dl.deadline ? new Date(dl.deadline).toLocaleDateString('ru-RU') : '';
          
          return (
            <button
              key={dl.id}
              onClick={() => onNavigate(dl.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                status === 'overdue'
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                  : status === 'soon'
                  ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
              } hover:shadow-sm`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {dl.title}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    status === 'overdue'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : status === 'soon'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
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

