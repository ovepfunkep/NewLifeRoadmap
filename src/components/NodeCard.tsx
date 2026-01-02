import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { computeProgress, getDeadlineColor, getProgressCounts, formatDeadline } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { useEffects } from '../hooks/useEffects';
import { FiCheck, FiEdit2, FiTrash2, FiArrowUp, FiMove } from 'react-icons/fi';
import { Tooltip } from './Tooltip';

interface NodeCardProps {
  node: Node;
  index: number;
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onEdit: (node: Node) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (id: string, priority: boolean) => void;
  onMove?: (node: Node) => void;
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
  onMove,
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
  const deadlineDisplay = formatDeadline(node.deadline);
  const { effectsEnabled } = useEffects();
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [justDragged, setJustDragged] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [longPressPos, setLongPressPos] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Состояние для барабана действий на мобильных (магнит + бесконечная лента)
  // Важно: во время drag мы НЕ меняем индекс выбранного действия, меняется только offsetPx.
  // Индекс меняется только после завершения "магнитной" доводки — так избегаем визуальных рывков.
  const [baseActionIndex, setBaseActionIndex] = useState(0);
  const baseActionIndexRef = useRef(0);
  const [offsetPx, setOffsetPx] = useState(0); // Смещение барабана в пикселях (может быть > ITEM_HEIGHT)
  const offsetPxRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);
  const drumRef = useRef<HTMLDivElement>(null);

  // Синхронизируем рефы с состоянием для использования в нативных обработчиках без "stale closure"
  useEffect(() => {
    baseActionIndexRef.current = baseActionIndex;
  }, [baseActionIndex]);

  useEffect(() => {
    offsetPxRef.current = offsetPx;
  }, [offsetPx]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const actions = [
    { id: 'complete', icon: FiCheck, action: () => onMarkCompleted(node.id, !node.completed), label: node.completed ? t('node.markIncomplete') : t('node.markCompleted'), color: 'var(--accent)', active: node.completed },
    { id: 'priority', icon: FiArrowUp, action: () => onTogglePriority(node.id, !node.priority), label: node.priority ? t('tooltip.removePriority') : t('tooltip.priority'), color: 'var(--accent)', active: node.priority },
    { id: 'edit', icon: FiEdit2, action: () => onEdit(node), label: t('general.edit'), color: 'var(--accent)' },
    { id: 'move', icon: FiMove, action: () => onMove?.(node), label: t('node.move'), color: 'var(--accent)' },
    { id: 'delete', icon: FiTrash2, action: () => onDelete(node.id), label: t('general.delete'), color: '#ef4444' },
  ];

  const ITEM_HEIGHT = 36;

  useEffect(() => {
    const drum = drumRef.current;
    if (!drum || !isMobile) return;

    const DRUM_DEBUG = (() => {
      try {
        return localStorage.getItem('DRUM_DEBUG') === '1';
      } catch {
        return false;
      }
    })();
    const dragStartYRef = { current: 0 };
    const dragStartOffsetRef = { current: 0 };
    const isDraggingRef = { current: false };
    const rafRef = { current: 0 as number | 0 };
    const lastScrollEndTimeRef = { current: 0 };

    const stopAnim = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    const mod = (n: number, m: number) => ((n % m) + m) % m;

    const animateOffsetTo = (target: number, onDone: () => void) => {
      stopAnim();
      const from = offsetPxRef.current;
      const dist = target - from;
      if (Math.abs(dist) < 0.5) {
        offsetPxRef.current = target;
        setOffsetPx(target);
        onDone();
        return;
      }

      const start = performance.now();
      const duration = 220; // чуть длиннее, чтобы "магнит" был мягче
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const v = from + dist * easeOutCubic(t);
        offsetPxRef.current = v;
        setOffsetPx(v);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = 0;
          onDone();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      stopAnim();
      isDraggingRef.current = true;
      dragStartYRef.current = e.touches[0].clientY;
      dragStartOffsetRef.current = offsetPxRef.current;

      if (DRUM_DEBUG) {
        console.log('[Drum] start', {
          baseActionIndex: baseActionIndexRef.current,
          offsetPx: offsetPxRef.current,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      const y = e.touches[0]?.clientY;
      if (typeof y !== 'number') return;
      const delta = y - dragStartYRef.current;
      
      const next = dragStartOffsetRef.current + delta;
      offsetPxRef.current = next;
      setOffsetPx(next);
      if (e.cancelable) e.preventDefault();
    };

    const handleTouchEndLike = (e?: TouchEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      
      const currentOffset = offsetPxRef.current;
      const totalDelta = Math.abs(currentOffset - dragStartOffsetRef.current);
      
      // Если это был короткий тап (маленькое смещение), вызываем действие
      // Но только если мы не только что закончили скролл (защита от "двойных" срабатываний)
      if (totalDelta < 8 && (performance.now() - lastScrollEndTimeRef.current > 300)) {
        const items = Math.round(currentOffset / ITEM_HEIGHT);
        const len = actions.length;
        const idx = ((baseActionIndexRef.current - items) % len + len) % len;
        
        actions[idx].action();
        
        // Сбрасываем в 0 без анимации если это был тап
        setOffsetPx(0);
        offsetPxRef.current = 0;
        return;
      }

      if (e?.cancelable) e.preventDefault();

      const itemsSwiped = Math.round(currentOffset / ITEM_HEIGHT);
      const snapTargetOffset = itemsSwiped * ITEM_HEIGHT;

      if (DRUM_DEBUG) {
        console.log('[Drum] end', {
          baseActionIndex: baseActionIndexRef.current,
          currentOffset,
          itemsSwiped,
          snapTargetOffset,
        });
      }

      // 1) Сначала "магнитом" доводим offset до ближайшего кратного ITEM_HEIGHT
      // 2) Только после завершения анимации коммитим индекс и сбрасываем offset в 0.
      animateOffsetTo(snapTargetOffset, () => {
        // Критично: коммит индекса и сброс offset должны быть атомарными (1 рендер),
        // иначе возможен краткий промежуточный кадр и визуальный "дёрг".
        flushSync(() => {
          if (itemsSwiped !== 0) {
            const nextBase = mod(baseActionIndexRef.current - itemsSwiped, actions.length);
            setBaseActionIndex(nextBase);
            baseActionIndexRef.current = nextBase;
          }
          offsetPxRef.current = 0;
          setOffsetPx(0);
          lastScrollEndTimeRef.current = performance.now();
        });
      });
    };

    drum.addEventListener('touchstart', handleTouchStart, { passive: false });
    drum.addEventListener('touchmove', handleTouchMove, { passive: false });
    drum.addEventListener('touchend', handleTouchEndLike, { passive: false });
    drum.addEventListener('touchcancel', handleTouchEndLike, { passive: false });

    return () => {
      stopAnim();
      drum.removeEventListener('touchstart', handleTouchStart);
      drum.removeEventListener('touchmove', handleTouchMove);
      drum.removeEventListener('touchend', handleTouchEndLike);
      drum.removeEventListener('touchcancel', handleTouchEndLike);
    };
  }, [isMobile, actions.length]); // Убрали currentActionIndex из зависимостей!

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
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    
    setLongPressPos({ x: startX, y: startY });
    setIsLongPressing(true);
    setLongPressProgress(0);

    let hasStartedDrag = false;
    const LONG_PRESS_DURATION = 600;
    const startTime = performance.now();
    let animFrame: number | null = null;
    
    const startDrag = (x: number, y: number) => {
      hasStartedDrag = true;
      setIsLongPressing(false);
      setLongPressProgress(0);
      setIsDragging(true);
      setDragPosition({ x, y });
      onDragStart?.(node);
      document.body.style.userSelect = 'none';
      
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    };

    const updateProgress = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / LONG_PRESS_DURATION);
      
      if (progress < 1) {
        setLongPressProgress(progress);
        animFrame = requestAnimationFrame(updateProgress);
      } else {
        setLongPressProgress(1);
        startDrag(startX, startY);
      }
    };

    animFrame = requestAnimationFrame(updateProgress);
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const touch = moveEvent.touches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      if (!hasStartedDrag) {
        if (deltaX > 10 || deltaY > 10) {
          if (animFrame) cancelAnimationFrame(animFrame);
          setIsLongPressing(false);
          setLongPressProgress(0);
          window.removeEventListener('touchmove', handleTouchMove);
          window.removeEventListener('touchend', handleTouchEnd);
        }
      } else {
        setDragPosition({ x: touch.clientX, y: touch.clientY });
        if (moveEvent.cancelable) moveEvent.preventDefault();
      }
    };
    
    const handleTouchEnd = () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      setIsLongPressing(false);
      setLongPressProgress(0);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      document.body.style.userSelect = '';
      
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
    window.addEventListener('touchcancel', handleTouchEnd);
  };


  return (
    <>
      <div 
        data-node-id={node.id}
        className={`bg-white dark:bg-gray-800 rounded-lg border transition-all overflow-hidden ${
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
        <div className="flex items-stretch gap-0">
          {/* Заголовок и описание (кликабельный) */}
          <div
            className="flex-1 min-w-0 p-4"
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
              {/* Дедлайн над названием */}
              {deadlineDisplay && (
                <div className="mb-1">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-medium border uppercase tracking-wider"
                    style={{
                      borderColor: node.completed ? 'var(--accent)' : getDeadlineColor(node),
                      color: node.completed ? 'var(--accent)' : 'white',
                      backgroundColor: node.completed ? 'transparent' : getDeadlineColor(node),
                    }}
                  >
                    {deadlineDisplay}
                  </span>
                </div>
              )}

              {/* Название */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:opacity-75 transition-opacity line-clamp-2" style={{ color: 'var(--accent)' }}>
                  {node.title}
                </span>
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
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {node.description}
                </div>
              )}
            </div>
            </button>
          </div>
          
          {/* Действия (иконки или карусель) */}
          <div className="flex items-stretch gap-0 flex-shrink-0">
            {isMobile ? (
              <div 
                ref={drumRef}
                className="relative flex items-center justify-center w-20 touch-none border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 overflow-hidden select-none"
                style={{ 
                  minHeight: '120px', 
                  maxHeight: '140px' 
                }}
              >
                {/* Барабан действий */}
                <div 
                  className="flex flex-col items-center justify-center h-full relative"
                  style={{ 
                    // Смещение применяется ко всему контейнеру для плавности
                    transform: `translateY(${offsetPx}px)`,
                    // Анимацию магнита делаем через requestAnimationFrame, чтобы не было рывков при смене индекса.
                    transition: 'none'
                  }}
                >
                  {/* Отрисовываем большой диапазон для бесконечного скролла */}
                  {Array.from({ length: 41 }, (_, i) => i - 20).map((offset) => {
                    const actionIndex = ((baseActionIndex + offset) % actions.length + actions.length) % actions.length;
                    const action = actions[actionIndex];
                    const Icon = action.icon;
                    
                    // Вычисляем расстояние от центра (0) с учетом текущего сдвига в пикселях
                    const visualOffset = (offset * ITEM_HEIGHT) + offsetPx;
                    const dist = Math.abs(visualOffset);
                    // Выбранный элемент определяем дискретно (по ближайшему к центру),
                    // чтобы он не "мигал" на границе из-за дробных offsetPx.
                    const centerOffset = Math.round(-offsetPx / ITEM_HEIGHT);
                    const isSelected = offset === centerOffset;
                    
                    // Масштаб и прозрачность
                    const scale = Math.max(0.6, 1.2 - (dist / (ITEM_HEIGHT * 2))); 
                    const opacity = isSelected ? 1 : Math.max(0, Math.min(0.5, (1 - (dist / (ITEM_HEIGHT * 3))) + 0.15));

                    // Не рендерим слишком далекие элементы для оптимизации
                    if (dist > 150) return null;

                    return (
                      <div 
                        key={offset}
                        className="absolute flex items-center justify-center"
                        style={{ 
                          top: '50%',
                          marginTop: `${offset * ITEM_HEIGHT - (ITEM_HEIGHT / 2)}px`,
                          height: `${ITEM_HEIGHT}px`,
                          width: '100%',
                          transform: `scale(${scale})`,
                          opacity: isSelected ? 1 : opacity,
                          color: action.color,
                          zIndex: isSelected ? 10 : 1,
                          // Убираем все переходы, чтобы rAF управлял всем визуалом без задержек
                          transition: 'none'
                        }}
                      >
                        <div 
                          className={`p-1.5 rounded-lg flex items-center justify-center ${
                            isSelected 
                              ? 'border-2 shadow-sm' 
                              : '' 
                          }`}
                          style={{
                            backgroundColor: isSelected && action.active ? action.color : 'transparent',
                            borderColor: isSelected 
                              ? (action.active ? 'transparent' : 'currentColor')
                              : 'transparent',
                            color: isSelected && action.active ? 'white' : action.color,
                            transition: 'none', // Убираем все переходы внутри барабана
                            ...(action.id === 'delete' && isSelected ? { borderColor: '#ef4444', color: '#ef4444' } : {})
                          }}
                        >
                          <Icon size={18} style={{ color: isSelected && action.active ? 'white' : undefined }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Визуальный градиент (маска) сверху и снизу для скрытия краев */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white via-transparent to-white dark:from-gray-800 dark:via-transparent dark:to-gray-800 opacity-90" 
                     style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%)' }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1 p-4">
                {actions.map((action) => (
                  <Tooltip key={action.id} text={action.label}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        action.action();
                      }}
                      className={`p-2 rounded-lg transition-all border hover:brightness-150 ${
                        action.active
                          ? 'border-transparent'
                          : 'border-current hover:bg-accent/10'
                      }`}
                      style={{ 
                        color: action.color,
                        backgroundColor: action.active ? action.color : 'transparent'
                      }}
                    >
                      {React.createElement(action.icon, { 
                        size: 18, 
                        style: { color: action.active ? 'white' : action.color } 
                      })}
                    </button>
                  </Tooltip>
                ))}
              </div>
            )}
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

      {/* Индикатор долгого нажатия */}
      {isLongPressing && (
        <div 
          className="fixed pointer-events-none z-[110]"
          style={{
            left: longPressPos.x - 30, // Сдвигаем влево
            top: longPressPos.y - 30,  // Сдвигаем вверх
            width: '30px',
            height: '30px'
          }}
        >
          <svg width="30" height="30" viewBox="0 0 40 40" className="drop-shadow-sm">
            {/* Тонкий контур, который будет заполняться */}
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="white"
              strokeWidth="2"
              className="opacity-20"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeDasharray="100.5"
              strokeDashoffset={100.5 * (1 - longPressProgress)}
              strokeLinecap="round"
              transform="rotate(-90 20 20)"
              style={{ transition: 'none' }}
            />
          </svg>
        </div>
      )}
    </>
  );
}
