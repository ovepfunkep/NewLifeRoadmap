import { useState, useEffect } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { collectDeadlines, sortByDeadlineAsc, getDeadlineColor, buildBreadcrumbs } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { getNode } from '../db';

interface DeadlineListProps {
  node: Node;
  onNavigate: (id: string) => void;
}

// Группировка дедлайнов: возвращаем все задачи с минимальным дедлайном для каждого первого уровня дочерних узлов
// Учитываем как сам шаг первого уровня, так и все его подшаги
function groupDeadlines(node: Node): Node[] {
  const result: Node[] = [];
  
  // Для каждого первого уровня дочерних узлов находим все задачи с минимальным дедлайном
  for (const child of node.children) {
    // Проверяем дедлайн самого шага первого уровня
    const childHasDeadline = child.deadline && !child.completed;
    
    // Собираем все дедлайны из поддерева (включая сам шаг)
    const allDeadlines: Node[] = [];
    if (childHasDeadline) {
      allDeadlines.push(child);
    }
    
    // Добавляем дедлайны из поддерева
    const subtreeDeadlines = collectDeadlines(child).filter(dl => !dl.completed && dl.deadline);
    allDeadlines.push(...subtreeDeadlines);
    
    if (allDeadlines.length === 0) continue;
    
    // Сортируем и находим минимальный дедлайн
    const sorted = sortByDeadlineAsc(allDeadlines);
    const minDeadline = sorted[0]?.deadline;
    
    if (!minDeadline) continue;
    
    // Находим все задачи с минимальным дедлайном
    const minDeadlineTime = new Date(minDeadline).getTime();
    const tasksWithMinDeadline = sorted.filter(task => 
      task.deadline && new Date(task.deadline).getTime() === minDeadlineTime
    );
    
    // Добавляем все задачи с минимальным дедлайном
    result.push(...tasksWithMinDeadline);
  }
  
  return result;
}

export function DeadlineList({ node, onNavigate }: DeadlineListProps) {
  useDeadlineTicker(); // подписка на тикер
  const [deadlinesWithBreadcrumbs, setDeadlinesWithBreadcrumbs] = useState<Array<{ node: Node; breadcrumbs: Node[] }>>([]);

          useEffect(() => {
            const loadBreadcrumbs = async () => {
              const grouped = groupDeadlines(node);
              const result: Array<{ node: Node; breadcrumbs: Node[] }> = [];

              for (const deadlineNode of grouped) {
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
    
    loadBreadcrumbs();
  }, [node]);

  if (deadlinesWithBreadcrumbs.length === 0) {
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
        {deadlinesWithBreadcrumbs.map(({ node: dl, breadcrumbs }) => {
          const dateStr = dl.deadline ? new Date(dl.deadline).toLocaleDateString('ru-RU') : '';
          const deadlineColor = getDeadlineColor(dl);
          
          return (
            <button
              key={dl.id}
              onClick={() => onNavigate(dl.id)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:shadow-sm transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Breadcrumbs - мелким шрифтом, полупрозрачным, над названием */}
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
                      {dl.title}
                    </span>
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded text-white flex-shrink-0 self-center"
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

