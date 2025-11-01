import React from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { computeProgress, deadlineStatus } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { FiCheck, FiEdit2, FiTrash2, FiArrowUp } from 'react-icons/fi';
import { MdDragIndicator } from 'react-icons/md';
import { Tooltip } from './Tooltip';

interface NodeCardProps {
  node: Node;
  index: number;
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onEdit: (node: Node) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (id: string, priority: boolean) => void;
  isDragging?: boolean;
  dragHandleProps?: any;
  draggableProps?: any;
}

export function NodeCard({ 
  node, 
  index,
  onNavigate, 
  onMarkCompleted, 
  onEdit, 
  onDelete,
  onTogglePriority,
  isDragging = false,
  dragHandleProps,
  draggableProps
}: NodeCardProps) {
  useDeadlineTicker();
  const progress = computeProgress(node);
  const deadlineStat = deadlineStatus(node);
  const deadlineDisplay = node.deadline ? new Date(node.deadline).toLocaleDateString('ru-RU') : null;

  return (
    <div 
      {...draggableProps}
      className={`bg-white dark:bg-gray-800 rounded-lg border transition-all p-3 ${
        node.priority 
          ? 'border-2 shadow-md' 
          : 'border-gray-200 dark:border-gray-700 shadow-sm'
      } hover:shadow-md ${
        isDragging ? 'opacity-50' : ''
      }`}
      style={node.priority ? { borderColor: 'var(--accent)' } : {}}
    >
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        <div 
          {...dragHandleProps} 
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <MdDragIndicator size={20} />
        </div>

        {/* Заголовок (кликабельный) */}
        <button
          onClick={() => onNavigate(node.id)}
          className="flex-1 min-w-0 text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:opacity-75 transition-opacity truncate" style={{ color: 'var(--accent)' }}>
              {node.title}
            </span>
            {node.priority && (
              <span className="flex-shrink-0 text-xs font-medium rounded border-2" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                Приоритет
              </span>
            )}
            {node.completed && (
              <FiCheck className="flex-shrink-0" size={18} style={{ color: 'var(--accent)' }} />
            )}
          </div>
          
          {/* Описание */}
          {node.description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
              {node.description}
            </p>
          )}
          
          {/* Дедлайн и прогресс */}
          <div className="flex items-center gap-2 mt-1 gap-3">
            {deadlineDisplay && !node.completed && (
              <span
                className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                  deadlineStat === 'overdue'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : deadlineStat === 'soon'
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {deadlineDisplay}
              </span>
            )}
            {node.children.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {progress}%
                </span>
              </div>
            )}
          </div>
        </button>
        
        {/* Действия (иконки) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Tooltip text={node.completed ? t('node.markIncomplete') : t('node.markCompleted')}>
            <button
              onClick={() => onMarkCompleted(node.id, !node.completed)}
              className={`p-2 rounded-lg transition-all border ${
                node.completed
                  ? 'border-transparent'
                  : 'border-current hover:bg-accent/10'
              }`}
              style={{ 
                color: 'var(--accent)',
                backgroundColor: node.completed ? 'var(--accent)' : 'transparent'
              }}
            >
              <FiCheck size={18} style={{ color: node.completed ? 'white' : 'var(--accent)' }} />
            </button>
          </Tooltip>
          
          <Tooltip text={node.priority ? 'Убрать приоритет' : 'Приоритетная задача'}>
            <button
              onClick={() => onTogglePriority(node.id, !node.priority)}
              className={`p-2 rounded-lg transition-all border ${
                node.priority
                  ? 'border-transparent'
                  : 'border-current hover:bg-accent/10'
              }`}
              style={{ 
                color: 'var(--accent)',
                backgroundColor: node.priority ? 'var(--accent)' : 'transparent'
              }}
            >
              <FiArrowUp size={18} style={{ color: node.priority ? 'white' : 'var(--accent)' }} />
            </button>
          </Tooltip>
          
          <Tooltip text={t('general.edit')}>
            <button
              onClick={() => onEdit(node)}
              className="p-2 rounded-lg hover:bg-accent/10 transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <FiEdit2 size={18} />
            </button>
          </Tooltip>
          
          <Tooltip text={t('general.delete')}>
            <button
              onClick={() => onDelete(node.id)}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
            >
              <FiTrash2 size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
