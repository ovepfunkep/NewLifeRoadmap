import React, { useState, useEffect } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { computeProgress, deadlineStatus, getDeadlineColor } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { FiCheck, FiEdit2, FiTrash2, FiArrowUp } from 'react-icons/fi';
import { Tooltip } from './Tooltip';

interface NodeCardProps {
  node: Node;
  index: number;
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onEdit: (node: Node) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (id: string, priority: boolean) => void;
  onDragStart?: (node: Node) => void;
  onDragEnd?: () => void;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
  isDragOver?: boolean;
  draggedNode?: Node | null;
}

export function NodeCard({ 
  node, 
  index,
  onNavigate, 
  onMarkCompleted, 
  onEdit, 
  onDelete,
  onTogglePriority,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  isDragOver = false,
  draggedNode
}: NodeCardProps) {
  useDeadlineTicker();
  const progress = computeProgress(node);
  const deadlineStat = deadlineStatus(node);
  const deadlineDisplay = node.deadline ? new Date(node.deadline).toLocaleDateString('ru-RU') : null;
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd?.();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onDragEnd]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // только левая кнопка мыши
    setIsDragging(true);
    setDragPosition({ x: e.clientX, y: e.clientY });
    onDragStart?.(node);
    e.preventDefault();
  };

  const handleMouseEnter = () => {
    if (draggedNode && draggedNode.id !== node.id) {
      onDragOver?.(node.id);
    }
  };

  const handleMouseLeave = () => {
    onDragLeave?.();
  };

  return (
    <>
      <div 
        className={`bg-white dark:bg-gray-800 rounded-lg border transition-all p-3 ${
          node.priority 
            ? 'border-2 shadow-md' 
            : 'border-gray-200 dark:border-gray-700 shadow-sm'
        } hover:shadow-md ${
          isDragOver ? 'shadow-lg ring-2 ring-offset-2' : ''
        }`}
        style={{
          ...(node.priority ? { borderColor: 'var(--accent)' } : {}),
          ...(isDragOver ? { 
            boxShadow: `0 0 0 3px var(--accent), 0 4px 6px -1px rgba(0, 0, 0, 0.1)`,
            transition: 'all 0.5s ease'
          } : {})
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center gap-3">
          {/* Заголовок и описание (кликабельный) */}
          <div
            className="flex-1 min-w-0 group"
            onMouseDown={handleMouseDown}
          >
            <button
              onClick={() => onNavigate(node.id)}
              className="w-full text-left"
            >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:opacity-75 transition-opacity truncate" style={{ color: 'var(--accent)' }}>
                {node.title}
              </span>
              {node.description && (
                <>
                  <span className="text-gray-400">—</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {node.description}
                  </span>
                </>
              )}
              {node.priority && (
                <span className="flex-shrink-0 text-xs font-medium rounded border-2" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  Приоритет
                </span>
              )}
              {node.completed && (
                <FiCheck className="flex-shrink-0" size={18} style={{ color: 'var(--accent)' }} />
              )}
            </div>
            
            {/* Дедлайн и прогресс */}
            <div className="flex items-center gap-2 mt-1 gap-3">
              {deadlineDisplay && !node.completed && (
                <span
                  className="text-xs px-2 py-0.5 rounded flex-shrink-0 text-white"
                  style={{
                    backgroundColor: getDeadlineColor(node),
                  }}
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
                        backgroundColor: progress === 100 ? 'var(--accent)' : '#9ca3af',
                      }}
                    />
                  </div>
                  <span 
                    className={`text-xs ${
                      progress === 100 
                        ? '' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                    style={{ 
                      color: progress === 100 ? 'var(--accent)' : undefined 
                    }}
                  >
                    {progress}%
                  </span>
                </div>
              )}
            </div>
            </button>
          </div>
          
          {/* Действия (иконки) */}
          <div className="flex items-center gap-1 flex-shrink-0">
                   <Tooltip text={node.completed ? t('node.markIncomplete') : t('node.markCompleted')}>
                     <button
                       onClick={() => onMarkCompleted(node.id, !node.completed)}
                       className={`p-2 rounded-lg transition-all border hover:brightness-150 ${
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
                       className={`p-2 rounded-lg transition-all border hover:brightness-150 ${
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
                       className="p-2 rounded-lg hover:bg-accent/10 transition-all hover:brightness-150"
                       style={{ color: 'var(--accent)' }}
                     >
                       <FiEdit2 size={18} />
                     </button>
                   </Tooltip>
                   
                   <Tooltip text={t('general.delete')}>
                     <button
                       onClick={() => onDelete(node.id)}
                       className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-all hover:brightness-150"
                     >
                       <FiTrash2 size={18} />
                     </button>
                   </Tooltip>
          </div>
        </div>
      </div>

      {/* Полупрозрачная копия при перетаскивании */}
      {isDragging && draggedNode?.id === node.id && (
        <div
          className="fixed pointer-events-none z-50 opacity-50 transform scale-50"
          style={{
            left: dragPosition.x - 150,
            top: dragPosition.y - 50,
            width: '300px'
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-700 shadow-xl p-3">
            <div className="font-semibold text-gray-900 dark:text-gray-100 truncate" style={{ color: 'var(--accent)' }}>
              {node.title}
            </div>
            {node.description && (
              <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
                {node.description}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
