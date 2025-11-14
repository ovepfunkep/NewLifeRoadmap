import React, { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { computeProgress, getDeadlineColor, getProgressCounts } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { useEffects } from '../hooks/useEffects';
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
  currentNodeId?: string;
}

export function NodeCard({ 
  node, 
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
  draggedNode,
  currentNodeId
}: NodeCardProps) {
  useDeadlineTicker();
  const t = useTranslation();
  const progress = computeProgress(node);
  const deadlineDisplay = node.deadline ? new Date(node.deadline).toLocaleDateString('ru-RU') : null;
  const { effectsEnabled } = useEffects();
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [justDragged, setJustDragged] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Мигание прогресс-бара при 100% - пересчитывается при изменении node
  useEffect(() => {
    const currentProgress = computeProgress(node);
    // Мигаем когда прогресс 100%, эффекты включены, и узел сам не помечен как выполненный
    if (currentProgress === 100 && effectsEnabled && !node.completed) {
      setIsBlinking(true);
    } else {
      setIsBlinking(false);
    }
  }, [node, effectsEnabled]);

  // Очищаем таймер при размонтировании
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        setDragPosition({ x: touch.clientX, y: touch.clientY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setJustDragged(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setJustDragged(false), 100);
      // Не вызываем onDragEnd здесь - он будет вызван в handleCardMouseUp при наведении на карточку
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      setJustDragged(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setJustDragged(false), 100);
      // Не вызываем onDragEnd здесь - он будет вызван в handleCardTouchEnd при наведении на карточку
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isDragging]);

  // Обработчики для drag over - по аналогии с крошками
  const handleMouseEnter = () => {
    console.log('[NodeCard] handleMouseEnter', { 
      nodeId: node.id, 
      draggedNodeId: draggedNode?.id, 
      currentNodeId,
      hasDraggedNode: !!draggedNode
    });
    // Запрещаем перетаскивание в текущий узел
    if (currentNodeId && node.id === currentNodeId) {
      console.log('[NodeCard] Blocked: cannot drag to current node');
      return;
    }
    if (draggedNode && draggedNode.id !== node.id) {
      console.log('[NodeCard] Calling onDragOver', node.id);
      onDragOver?.(node.id);
    } else {
      console.log('[NodeCard] No drag over: no draggedNode or same node');
    }
  };

  const handleMouseLeave = () => {
    console.log('[NodeCard] handleMouseLeave', { nodeId: node.id });
    // Сбрасываем подсветку при уходе мышки с карточки
    onDragLeave?.();
  };

  const handleCardMouseUp = () => {
    if (draggedNode && draggedNode.id !== node.id) {
      // Сбрасываем justDragged сразу после завершения перетаскивания
      setJustDragged(false);
      // Небольшая задержка перед вызовом onDragEnd, чтобы избежать конфликта с onClick
      setTimeout(() => {
        onDragEnd?.();
      }, 10);
    } else {
      // Если не было перетаскивания, сбрасываем justDragged сразу
      setJustDragged(false);
    }
  };

  const handleCardTouchEnd = () => {
    console.log('[NodeCard] handleCardTouchEnd', { 
      nodeId: node.id, 
      draggedNodeId: draggedNode?.id,
      isDifferent: draggedNode && draggedNode.id !== node.id
    });
    if (draggedNode && draggedNode.id !== node.id) {
      console.log('[NodeCard] Calling onDragEnd from touch end');
      onDragEnd?.();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // только левая кнопка мыши
    console.log('[NodeCard] handleMouseDown', { nodeId: node.id });
    // Запоминаем начальную позицию
    const startX = e.clientX;
    const startY = e.clientY;
    let hasStartedDrag = false;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Проверяем, что мышь сдвинулась минимум на 3px при зажатой мышке - это означает начало drag
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      if (!hasStartedDrag && (deltaX > 3 || deltaY > 3)) {
        hasStartedDrag = true;
        console.log('[NodeCard] Drag started (mouse)', { nodeId: node.id, deltaX, deltaY });
        setIsDragging(true);
        setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        onDragStart?.(node);
        // Предотвращаем выделение текста только после начала перетаскивания
        document.body.style.userSelect = 'none';
      }
      if (hasStartedDrag) {
        setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      }
    };
    
    const handleMouseUp = () => {
      document.body.style.userSelect = ''; // Восстанавливаем выделение текста
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasStartedDrag) {
        setIsDragging(false);
        setJustDragged(true);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => setJustDragged(false), 100);
        onDragEnd?.();
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    console.log('[NodeCard] handleTouchStart', { nodeId: node.id });
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    let hasStartedDrag = false;
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const touch = moveEvent.touches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);
      if (!hasStartedDrag && (deltaX > 5 || deltaY > 5)) {
        hasStartedDrag = true;
        console.log('[NodeCard] Drag started (touch)', { nodeId: node.id, deltaX, deltaY });
        setIsDragging(true);
        setDragPosition({ x: touch.clientX, y: touch.clientY });
        onDragStart?.(node);
        moveEvent.preventDefault(); // Предотвращаем скролл
      }
      if (hasStartedDrag) {
        setDragPosition({ x: touch.clientX, y: touch.clientY });
        moveEvent.preventDefault();
      }
    };
    
    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      if (hasStartedDrag) {
        setIsDragging(false);
        setJustDragged(true);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => setJustDragged(false), 100);
        onDragEnd?.();
      }
    };
    
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  };


  return (
    <>
      <div 
        data-node-id={node.id}
        className={`bg-white dark:bg-gray-800 rounded-lg border transition-all p-4 ${
          node.priority 
            ? 'border-2' 
            : 'border-gray-300 dark:border-gray-700'
        } ${
          isDragOver ? 'ring-2 ring-offset-2' : ''
        } ${
          draggedNode && draggedNode.id !== node.id ? 'opacity-60' : ''
        }`}
        style={{
          ...(node.priority ? { borderColor: 'var(--accent)' } : {}),
          // Material Design elevation shadows для светлой темы
          boxShadow: node.priority 
            ? '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)' // dp2 для приоритетных
            : '0 1px 2px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06)', // dp1 для обычных
          ...(isDragOver ? { 
            boxShadow: `0 0 0 3px var(--accent), 0 4px 8px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.1)`, // dp8 при drag-over
            transition: 'all 0.3s ease'
          } : {}),
          ...(draggedNode && draggedNode.id !== node.id && (!currentNodeId || node.id !== currentNodeId) ? {
            borderColor: 'var(--accent)',
            opacity: 0.7
          } : {})
        }}
        onMouseEnter={(e) => {
          handleMouseEnter();
          // Увеличиваем elevation при hover
          if (!isDragOver && !draggedNode) {
            e.currentTarget.style.boxShadow = node.priority
              ? '0 4px 8px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.1)' // dp4
              : '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)'; // dp2
          }
        }}
        onMouseLeave={(e) => {
          handleMouseLeave();
          // Возвращаем обычный elevation
          if (!isDragOver && !draggedNode) {
            e.currentTarget.style.boxShadow = node.priority
              ? '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)' // dp2
              : '0 1px 2px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06)'; // dp1
          }
        }}
        onMouseUp={handleCardMouseUp}
        onTouchEnd={handleCardTouchEnd}
      >
        <div className="flex items-center gap-3">
          {/* Заголовок и описание (кликабельный) */}
          <div
            className="flex-1 min-w-0"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <button
              onClick={(e) => {
                // Предотвращаем клик, если только что закончили drag
                if (justDragged) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                onNavigate(node.id);
              }}
              className="w-full text-left group"
            >
            <div className="w-full">
              {/* Название и дедлайн в одну строку */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:opacity-75 transition-opacity truncate" style={{ color: 'var(--accent)' }}>
                  {node.title}
                </span>
                {deadlineDisplay && (
                  <span
                    className="text-xs px-2 py-0.5 rounded flex-shrink-0 border"
                    style={{
                      borderColor: node.completed ? 'var(--accent)' : getDeadlineColor(node),
                      color: node.completed ? 'var(--accent)' : 'white',
                      backgroundColor: node.completed ? 'transparent' : getDeadlineColor(node),
                    }}
                  >
                    {deadlineDisplay}
                  </span>
                )}
                {node.priority && (
                  <span className="flex-shrink-0 text-xs font-medium rounded border-2" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    {t('node.priority')}
                  </span>
                )}
              </div>
              
              {/* Прогресс */}
              {node.children.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${isBlinking ? 'animate-pulse' : ''}`}
                      style={{
                        width: `${progress}%`,
                        backgroundColor: progress === 100 ? 'var(--accent)' : '#9ca3af',
                        animation: isBlinking ? 'pulse 0.5s ease-in-out infinite' : undefined,
                      }}
                    />
                  </div>
                  <Tooltip text={`${getProgressCounts(node).completed} / ${getProgressCounts(node).total}`}>
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
                  </Tooltip>
                </div>
              )}
              
              {/* Описание */}
              {node.description && (
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
                  {node.description}
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
                   
                  <Tooltip text={node.priority ? t('tooltip.removePriority') : t('tooltip.priority')}>
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
