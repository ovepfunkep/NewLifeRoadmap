import React, { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { computeProgress, getProgressCounts, formatDeadline } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { useEffects } from '../hooks/useEffects';
import { useTheme } from '../hooks/useTheme';
import { FiCheck, FiEdit2, FiTrash2, FiArrowUp, FiMove } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { motion } from 'framer-motion';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionTransitions } from '../config/motion';

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
  isBurning?: boolean; 
  isMovingOut?: boolean; 
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
  currentNodeId,
  isBurning: isBurningProp = false,
  isMovingOut: isMovingOutProp = false
}: NodeCardProps) {
  useDeadlineTicker();
  const t = useTranslation();
  const progress = computeProgress(node);
  const deadlineDisplay = formatDeadline(node.deadline, node.deadlineEnd);
  const { effectsEnabled } = useEffects();
  const { allowDecorativeMotion } = useMotionPreferences();
  const { theme } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [justDragged, setJustDragged] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [longPressPos, setLongPressPos] = useState({ x: 0, y: 0 });
  const [isDrumActive, setIsDrumActive] = useState(false);
  
  const isBurning = isBurningProp;
  const isMovingOut = isMovingOutProp;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Состояние для барабана действий на мобильных (магнит + бесконечная лента)
  const [baseActionIndex, setBaseActionIndex] = useState(0);
  const baseActionIndexRef = useRef(0);
  const [offsetPx, setOffsetPx] = useState(0); 
  const offsetPxRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);
  const drumRef = useRef<HTMLDivElement>(null);
  const drumDragStartYRef = useRef(0);
  const drumDragStartOffsetRef = useRef(0);
  const drumIsDraggingRef = useRef(false);
  const drumHasMovedRef = useRef(false);
  const drumRafRef = useRef(0);
  const drumTouchIdRef = useRef<number | null>(null);
  const lastScrollEndTimeRef = useRef(0);
  const lastKnownTouchYRef = useRef<number | null>(null);
  const prevBodyTouchActionRef = useRef<string | null>(null);
  const prevHtmlTouchActionRef = useRef<string | null>(null);
  const drumPointerIdRef = useRef<number | null>(null);
  const pointerHandlingRef = useRef(false);

  // Стабильные ссылки на обработчики для предотвращения утечек
  const handleTouchMoveRef = useRef<(e: TouchEvent) => void>();
  const handleTouchEndLikeRef = useRef<(e?: TouchEvent) => void>();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Синхронизируем рефы с состоянием для использования в нативных обработчиках без "stale closure"
  useEffect(() => {
    baseActionIndexRef.current = baseActionIndex;
  }, [baseActionIndex]);

  useEffect(() => {
    offsetPxRef.current = offsetPx;
  }, [offsetPx]);

  // Реф для хранения актуальных действий, чтобы избежать stale closure в нативных событиях
  const actionsRef = useRef<any[]>([]);

  const actions = useMemo(() => [
    { id: 'complete', icon: FiCheck, action: () => onMarkCompleted(node.id, !node.completed), label: node.completed ? t('node.markIncomplete') : t('node.markCompleted'), color: 'var(--accent)', active: node.completed },
    { id: 'priority', icon: FiArrowUp, action: () => onTogglePriority(node.id, !node.priority), label: node.priority ? t('tooltip.removePriority') : t('tooltip.priority'), color: 'var(--accent)', active: node.priority },
    { id: 'edit', icon: FiEdit2, action: () => onEdit(node), label: t('general.edit'), color: 'var(--accent)' },
    { id: 'move', icon: FiMove, action: () => onMove?.(node), label: t('node.move'), color: 'var(--accent)' },
    { id: 'delete', icon: FiTrash2, action: () => onDelete(node.id), label: t('general.delete'), color: '#ef4444' },
  ], [node.id, node.completed, node.priority, onMarkCompleted, onTogglePriority, onEdit, onMove, onDelete, t]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const ITEM_HEIGHT = 38; // Increased from 30 (approx 20% larger buttons area)

  const mod = (n: number, m: number) => ((n % m) + m) % m;

  const stopAnim = () => {
    if (drumRafRef.current) {
      cancelAnimationFrame(drumRafRef.current);
      drumRafRef.current = 0;
    }
  };

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
    const duration = 220; 
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + dist * easeOutCubic(t);
      offsetPxRef.current = v;
      setOffsetPx(v);
      if (t < 1) {
        drumRafRef.current = requestAnimationFrame(tick);
      } else {
        drumRafRef.current = 0;
        onDone();
      }
    };
    drumRafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const drum = drumRef.current;
    if (!drum || !isMobile) return;

    handleTouchMoveRef.current = (e: TouchEvent) => {
      // Проверяем, активен ли барабан для этого конкретного компонента
      if (!drumIsDraggingRef.current || drumTouchIdRef.current === null) {
        return;
      }
      if (pointerHandlingRef.current) {
        return;
      }
      
      // Агрессивно предотвращаем скролл страницы
      if (e.cancelable) {
        e.preventDefault();
      }
      
      const touch = Array.from(e.touches).find(t => t.identifier === drumTouchIdRef.current);
      
      if (!touch) {
        return;
      }

      const y = touch.clientY;
      lastKnownTouchYRef.current = y; // Сохраняем последнюю известную позицию
      const delta = y - drumDragStartYRef.current;
      
      if (Math.abs(delta) > 5) {
        drumHasMovedRef.current = true;
      }

      const next = drumDragStartOffsetRef.current + delta;
      offsetPxRef.current = next;
      setOffsetPx(next);
    };

    handleTouchEndLikeRef.current = (e?: TouchEvent) => {
      if (!drumIsDraggingRef.current) return;

      if (e && e.changedTouches) {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === drumTouchIdRef.current);
        if (!touch) {
          return; 
        }
      }

      drumIsDraggingRef.current = false;
      drumTouchIdRef.current = null;
      setIsDrumActive(false);
      document.body.classList.remove('any-drum-dragging');
      lastKnownTouchYRef.current = null;
      if (prevBodyTouchActionRef.current !== null) {
        document.body.style.touchAction = prevBodyTouchActionRef.current;
        prevBodyTouchActionRef.current = null;
      }
      if (prevHtmlTouchActionRef.current !== null) {
        document.documentElement.style.touchAction = prevHtmlTouchActionRef.current;
        prevHtmlTouchActionRef.current = null;
      }
      
      if (handleTouchMoveRef.current) {
        document.body.removeEventListener('touchmove', handleTouchMoveRef.current, { capture: true });
        document.removeEventListener('touchmove', handleTouchMoveRef.current, { capture: true });
        window.removeEventListener('touchmove', handleTouchMoveRef.current);
      }
      if (handleTouchEndLikeRef.current) {
        document.body.removeEventListener('touchend', handleTouchEndLikeRef.current, { capture: true });
        document.body.removeEventListener('touchcancel', handleTouchEndLikeRef.current, { capture: true });
        document.removeEventListener('touchend', handleTouchEndLikeRef.current, { capture: true });
        document.removeEventListener('touchcancel', handleTouchEndLikeRef.current, { capture: true });
        window.removeEventListener('touchend', handleTouchEndLikeRef.current);
        window.removeEventListener('touchcancel', handleTouchEndLikeRef.current);
      }

      const currentOffset = offsetPxRef.current;
      
      if (!drumHasMovedRef.current && (performance.now() - lastScrollEndTimeRef.current > 300)) {
        const items = Math.round(currentOffset / ITEM_HEIGHT);
        const len = actionsRef.current.length;
        const idx = ((baseActionIndexRef.current - items) % len + len) % len;
        
        actionsRef.current[idx].action();
        
        setOffsetPx(0);
        offsetPxRef.current = 0;
        return;
      }

      if (e?.cancelable) e.preventDefault();

      const itemsSwiped = Math.round(currentOffset / ITEM_HEIGHT);
      const snapTargetOffset = itemsSwiped * ITEM_HEIGHT;

      animateOffsetTo(snapTargetOffset, () => {
        flushSync(() => {
          if (itemsSwiped !== 0) {
            const nextBase = mod(baseActionIndexRef.current - itemsSwiped, actionsRef.current.length);
            setBaseActionIndex(nextBase);
            baseActionIndexRef.current = nextBase;
          }
          offsetPxRef.current = 0;
          setOffsetPx(0);
          lastScrollEndTimeRef.current = performance.now();
        });
      });
    };

    const handleTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (pointerHandlingRef.current) return;
      
      const isBlocked = document.body.classList.contains('any-drum-dragging');

      if (isBlocked) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }

      const touch = e.touches[0];
      drumTouchIdRef.current = touch.identifier;
      
      if (e.cancelable) e.preventDefault(); 
      e.stopImmediatePropagation(); 
      stopAnim();
      drumIsDraggingRef.current = true;
      drumHasMovedRef.current = false; 
      drumDragStartYRef.current = touch.clientY;
      drumDragStartOffsetRef.current = offsetPxRef.current;
      setIsDrumActive(true);
      if (prevBodyTouchActionRef.current === null) {
        prevBodyTouchActionRef.current = document.body.style.touchAction;
      }
      if (prevHtmlTouchActionRef.current === null) {
        prevHtmlTouchActionRef.current = document.documentElement.style.touchAction;
      }
      document.body.style.touchAction = 'none';
      document.documentElement.style.touchAction = 'none';
      
      document.body.classList.add('any-drum-dragging');

      // Используем capture phase на document.body для гарантированного перехвата всех событий
      // Добавляем обработчики на несколько уровней для максимального покрытия
      if (handleTouchMoveRef.current) {
        document.body.addEventListener('touchmove', handleTouchMoveRef.current, { passive: false, capture: true });
        document.addEventListener('touchmove', handleTouchMoveRef.current, { passive: false, capture: true });
        window.addEventListener('touchmove', handleTouchMoveRef.current, { passive: false });
      }
      if (handleTouchEndLikeRef.current) {
        document.body.addEventListener('touchend', handleTouchEndLikeRef.current, { passive: false, capture: true });
        document.body.addEventListener('touchcancel', handleTouchEndLikeRef.current, { passive: false, capture: true });
        document.addEventListener('touchend', handleTouchEndLikeRef.current, { passive: false, capture: true });
        document.addEventListener('touchcancel', handleTouchEndLikeRef.current, { passive: false, capture: true });
        window.addEventListener('touchend', handleTouchEndLikeRef.current, { passive: false });
        window.addEventListener('touchcancel', handleTouchEndLikeRef.current, { passive: false });
      }
    };

    const handlePointerMoveNative = (e: PointerEvent) => {
      if (!drumIsDraggingRef.current || drumPointerIdRef.current === null) {
        return;
      }
      if (e.pointerId !== drumPointerIdRef.current) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
      const y = e.clientY;
      lastKnownTouchYRef.current = y;
      const delta = y - drumDragStartYRef.current;
      if (Math.abs(delta) > 5) {
        drumHasMovedRef.current = true;
      }
      const next = drumDragStartOffsetRef.current + delta;
      offsetPxRef.current = next;
      setOffsetPx(next);
    };

    const handlePointerUpNative = (e: PointerEvent) => {
      if (drumPointerIdRef.current === null) return;
      if (e.pointerId !== drumPointerIdRef.current) return;
      pointerHandlingRef.current = false;
      drumPointerIdRef.current = null;
      if (drum && drum.hasPointerCapture(e.pointerId)) {
        drum.releasePointerCapture(e.pointerId);
      }
      handleTouchEndLikeRef.current?.();
    };

    const handlePointerDownNative = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (pointerHandlingRef.current) return;
      if (document.body.classList.contains('any-drum-dragging')) return;
      if (e.cancelable) {
        e.preventDefault();
      }

      pointerHandlingRef.current = true;
      drumPointerIdRef.current = e.pointerId;
      if (drum) {
        try {
          drum.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      stopAnim();
      drumIsDraggingRef.current = true;
      drumHasMovedRef.current = false;
      drumDragStartYRef.current = e.clientY;
      drumDragStartOffsetRef.current = offsetPxRef.current;
      setIsDrumActive(true);
      if (prevBodyTouchActionRef.current === null) {
        prevBodyTouchActionRef.current = document.body.style.touchAction;
      }
      if (prevHtmlTouchActionRef.current === null) {
        prevHtmlTouchActionRef.current = document.documentElement.style.touchAction;
      }
      document.body.style.touchAction = 'none';
      document.documentElement.style.touchAction = 'none';
      document.body.classList.add('any-drum-dragging');

      drum.addEventListener('pointermove', handlePointerMoveNative, { passive: false });
      drum.addEventListener('pointerup', handlePointerUpNative, { passive: false });
      drum.addEventListener('pointercancel', handlePointerUpNative, { passive: false });
    };

    const handleMouseDownNative = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (document.body.classList.contains('any-drum-dragging')) return;

      e.stopImmediatePropagation();
      stopAnim();
      drumIsDraggingRef.current = true;
      drumHasMovedRef.current = false;
      drumDragStartYRef.current = e.clientY;
      drumDragStartOffsetRef.current = offsetPxRef.current;
      setIsDrumActive(true);
      
      document.body.classList.add('any-drum-dragging');

      const handleMouseMoveMouse = (me: MouseEvent) => {
        if (!drumIsDraggingRef.current) return;
        const delta = me.clientY - drumDragStartYRef.current;
        if (Math.abs(delta) > 5) drumHasMovedRef.current = true;
        const next = drumDragStartOffsetRef.current + delta;
        offsetPxRef.current = next;
        setOffsetPx(next);
      };

      const handleMouseUpMouse = (_me: MouseEvent) => {
        drumIsDraggingRef.current = false;
        setIsDrumActive(false);
        document.body.classList.remove('any-drum-dragging');
        window.removeEventListener('mousemove', handleMouseMoveMouse);
        window.removeEventListener('mouseup', handleMouseUpMouse);
        
        const currentOffset = offsetPxRef.current;
        if (!drumHasMovedRef.current) {
          const items = Math.round(currentOffset / ITEM_HEIGHT);
          const len = actionsRef.current.length;
          const idx = ((baseActionIndexRef.current - items) % len + len) % len;
          actionsRef.current[idx].action();
          setOffsetPx(0);
          offsetPxRef.current = 0;
          return;
        }

        const itemsSwiped = Math.round(currentOffset / ITEM_HEIGHT);
        const snapTargetOffset = itemsSwiped * ITEM_HEIGHT;
        animateOffsetTo(snapTargetOffset, () => {
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

      window.addEventListener('mousemove', handleMouseMoveMouse);
      window.addEventListener('mouseup', handleMouseUpMouse);
    };

    drum.addEventListener('touchstart', handleTouchStartNative, { passive: false });
    drum.addEventListener('mousedown', handleMouseDownNative);
    drum.addEventListener('pointerdown', handlePointerDownNative, { passive: false });

    return () => {
      stopAnim();
      drum.removeEventListener('touchstart', handleTouchStartNative);
      drum.removeEventListener('mousedown', handleMouseDownNative);
      if (handleTouchMoveRef.current) {
        document.body.removeEventListener('touchmove', handleTouchMoveRef.current, { capture: true });
        document.removeEventListener('touchmove', handleTouchMoveRef.current, { capture: true });
        window.removeEventListener('touchmove', handleTouchMoveRef.current);
      }
      if (handleTouchEndLikeRef.current) {
        document.body.removeEventListener('touchend', handleTouchEndLikeRef.current, { capture: true });
        document.body.removeEventListener('touchcancel', handleTouchEndLikeRef.current, { capture: true });
        document.removeEventListener('touchend', handleTouchEndLikeRef.current, { capture: true });
        document.removeEventListener('touchcancel', handleTouchEndLikeRef.current, { capture: true });
        window.removeEventListener('touchend', handleTouchEndLikeRef.current);
        window.removeEventListener('touchcancel', handleTouchEndLikeRef.current);
      }
      drum.removeEventListener('pointerdown', handlePointerDownNative);
      drum.removeEventListener('pointermove', handlePointerMoveNative);
      drum.removeEventListener('pointerup', handlePointerUpNative);
      drum.removeEventListener('pointercancel', handlePointerUpNative);
    };
  }, [isMobile, node.id]);

  useEffect(() => {
    const currentProgress = computeProgress(node);
    if (currentProgress === 100 && effectsEnabled && !node.completed) {
      setIsBlinking(true);
    } else {
      setIsBlinking(false);
    }
  }, [node, effectsEnabled]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (longPressDelayTimeoutRef.current) {
        clearTimeout(longPressDelayTimeoutRef.current);
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
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      setJustDragged(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setJustDragged(false), 100);
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

  const handleMouseEnter = () => {
    if (currentNodeId && node.id === currentNodeId) return;
    if (draggedNode && draggedNode.id !== node.id) {
      onDragOver?.(node.id);
    }
  };

  const handleMouseLeave = () => {
    onDragLeave?.();
  };

  const handleCardMouseUp = () => {
    if (draggedNode && draggedNode.id !== node.id) {
      setJustDragged(false);
      setTimeout(() => {
        onDragEnd?.();
      }, 10);
    } else {
      setJustDragged(false);
    }
  };

  const handleCardTouchEnd = () => {
    if (draggedNode && draggedNode.id !== node.id) {
      onDragEnd?.();
    }
  };

  const isDragBlockedTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('[data-card-action="true"]'));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; 
    if (isDragBlockedTarget(e.target)) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let hasStartedDrag = false;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      if (!hasStartedDrag && (deltaX > 3 || deltaY > 3)) {
        hasStartedDrag = true;
        setIsDragging(true);
        setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        onDragStart?.(node);
        document.body.style.userSelect = 'none';
      }
      if (hasStartedDrag) {
        setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      }
    };
    
    const handleMouseUp = () => {
      document.body.style.userSelect = ''; 
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
    if (isDragBlockedTarget(e.target)) {
      return;
    }

    // Если барабан активен, игнорируем события карточки
    if (document.body.classList.contains('any-drum-dragging')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const touchId = touch.identifier;
    const startX = touch.clientX;
    const startY = touch.clientY;
    
    if (longPressDelayTimeoutRef.current) clearTimeout(longPressDelayTimeoutRef.current);
    
    // Задержка перед началом отображения прогресса долгого нажатия
    longPressDelayTimeoutRef.current = setTimeout(() => {
      setLongPressPos({ x: startX, y: startY });
      setIsLongPressing(true);
      setLongPressProgress(0);
    }, 250); 

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
      // Если барабан активен, полностью блокируем события карточки
      if (document.body.classList.contains('any-drum-dragging')) {
        if (moveEvent.cancelable) moveEvent.preventDefault();
        moveEvent.stopPropagation();
        moveEvent.stopImmediatePropagation();
        return;
      }

      const touch = Array.from(moveEvent.touches).find(t => t.identifier === touchId);
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      if (!hasStartedDrag) {
        // Если палец сдвинулся больше чем на 10px, отменяем долгое нажатие
        if (deltaX > 10 || deltaY > 10) {
          if (animFrame) cancelAnimationFrame(animFrame);
          if (longPressDelayTimeoutRef.current) clearTimeout(longPressDelayTimeoutRef.current);
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
    
    const handleTouchEnd = (endEvent: TouchEvent) => {
      const touch = Array.from(endEvent.changedTouches).find(t => t.identifier === touchId);
      if (!touch && endEvent.type !== 'touchcancel') return;

      if (animFrame) cancelAnimationFrame(animFrame);
      if (longPressDelayTimeoutRef.current) clearTimeout(longPressDelayTimeoutRef.current);
      setIsLongPressing(false);
      setLongPressProgress(0);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      document.body.style.userSelect = '';
      
      if (hasStartedDrag) {
        if (endEvent.cancelable) {
          endEvent.preventDefault();
        }
        endEvent.stopPropagation();
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

  const handleNavigateClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Do not open the node while drag gesture is active/just finished.
    if (
      justDragged ||
      isDragging ||
      (draggedNode && draggedNode.id === node.id) ||
      document.body.classList.contains('any-drum-dragging')
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onNavigate(node.id);
  };

  const peerDropHint = !!(
    draggedNode &&
    draggedNode.id !== node.id &&
    (!currentNodeId || node.id !== currentNodeId)
  );

  return (
    <>
      <div className="relative">
        <motion.div 
          data-node-id={node.id}
          initial={false}
          animate={{
            x: isMovingOut ? -100 : 0,
            opacity: isMovingOut || isBurning ? 0 : 1,
            scale: isMovingOut ? 0.95 : 1,
          }}
          transition={{
            x: { duration: effectsEnabled ? 0.8 : 0, ease: "easeIn" },
            opacity: { duration: isMovingOut ? (effectsEnabled ? 0.4 : 0) : motionTransitions.fade.duration },
          }}
          whileTap={allowDecorativeMotion && !isDrumActive ? { scale: 0.995 } : undefined}
          className={`relative flex min-h-[140px] flex-col overflow-hidden rounded-2xl bg-white transition-[box-shadow] duration-300 ease-out dark:bg-gray-800 ${
            node.priority
              ? 'border-2'
              : peerDropHint
                ? 'border border-accent/80'
                : 'border border-gray-200 dark:border-gray-700'
          } ${
            isDragOver ? 'ring-2 ring-offset-2' : ''
          } ${
            draggedNode && draggedNode.id !== node.id ? 'opacity-60' : ''
          } ${node.completed ? 'bg-accent/20 dark:bg-accent/30' : ''}`}
          style={{
            ...(node.completed ? { 
              opacity: 1, 
              backgroundColor: 'rgba(var(--accent-rgb), 0.2)',
            } : {}),
            ...(node.priority ? { borderColor: 'var(--accent)' } : {}),
            boxShadow: isDragOver
              ? `0 0 0 2px var(--accent), var(--card-shadow-priority)`
              : node.priority
                ? 'var(--card-shadow-priority)'
                : 'var(--card-shadow-soft)',
            ...(isDragOver ? { transition: 'all 0.3s ease' } : {}),
            ...(peerDropHint ? { opacity: 0.7 } : {}),
            visibility: isBurning && effectsEnabled ? 'hidden' : 'visible',
            pointerEvents: isDrumActive ? 'none' : 'auto'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleCardMouseUp}
          onTouchEnd={handleCardTouchEnd}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="flex flex-col flex-1 relative z-[2]">
            <div
              className={`flex min-w-0 flex-1 flex-col p-0 ${isMobile ? 'pr-16' : ''}`}
            >
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={handleNavigateClick}
                    className="group min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-col gap-1.5">
                      <h3 className="m-0 line-clamp-2 text-lg font-bold leading-snug text-gray-900 transition-opacity group-hover:opacity-75 dark:text-gray-100" style={{ color: 'var(--accent)' }}>
                        {node.title}
                      </h3>
                      {node.description && (
                        <div className="line-clamp-2 text-[12px] font-normal leading-[1.45] text-gray-500 dark:text-gray-400">
                          {node.description}
                        </div>
                      )}
                      {deadlineDisplay && (
                        <div className={node.description ? 'pt-0.5' : undefined}>
                          <span
                            className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              borderColor: '#f97316',
                              color: 'white',
                              backgroundColor: '#f97316',
                            }}
                          >
                            {deadlineDisplay}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  {!isMobile && (
                    <div className="relative z-10 ml-2 flex shrink-0">
                      <div className="flex items-center gap-1.5">
                        {actions.map((action) => (
                          <Tooltip key={action.id} text={action.label}>
                            <motion.button
                              type="button"
                              data-card-action="true"
                              onClick={(e) => { e.stopPropagation(); action.action(); }}
                              whileTap={allowDecorativeMotion ? { scale: 0.94 } : undefined}
                              className={`rounded-lg border p-2.5 shadow-sm transition-all hover:scale-110 ${action.active ? 'border-transparent' : 'border-current hover:bg-accent/10'}`}
                              style={{ color: action.color, backgroundColor: action.active ? action.color : 'transparent' }}
                            >
                              {React.createElement(action.icon, { size: 20, style: { color: action.active ? 'white' : action.color } })}
                            </motion.button>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Барабан для мобильных - центрирован по высоте контента без прогресс-бара */}
            {isMobile && (
              <div className="pointer-events-none absolute bottom-0 right-2 top-0 z-20 flex touch-none items-center">
                    <div 
                      ref={drumRef} 
                      className="drum-container pointer-events-auto relative flex h-full w-16 select-none items-center justify-center overflow-hidden rounded-lg touch-none"
                      style={{
                        backgroundColor: 'transparent'
                      }}
                    >
                      <div className="flex flex-col items-center justify-center h-full relative" style={{ transform: `translateY(${offsetPx}px)`, transition: 'none' }}>
                        {Array.from({ length: 41 }, (_, i) => i - 20).map((offset) => {
                          const actionIndex = ((baseActionIndex + offset) % actions.length + actions.length) % actions.length;
                          const action = actions[actionIndex];
                          const Icon = action.icon;
                          const centerOffset = Math.round(-offsetPx / ITEM_HEIGHT);
                          const isSelected = offset === centerOffset;
                          const dist = Math.abs((offset * ITEM_HEIGHT) + offsetPx);
                          const scale = Math.max(0.6, 1.3 - (dist / (ITEM_HEIGHT * 2))); // Increased base scale slightly
                          
                          // Smooth opacity: 1.0 at center, 0.6 at neighbor (30px), 0.0 at next (60px)
                          const opacity = isSelected ? 1 : Math.max(0, 0.6 - ((dist - ITEM_HEIGHT) / ITEM_HEIGHT) * 0.6);
                          
                          if (opacity <= 0) return null;
                          
                          return (
                            <div key={offset} className="absolute flex items-center justify-center" style={{ top: '50%', marginTop: `${offset * ITEM_HEIGHT - (ITEM_HEIGHT / 2)}px`, height: `${ITEM_HEIGHT}px`, width: '100%', transform: `scale(${scale})`, opacity: opacity, color: action.color, zIndex: isSelected ? 10 : 1, transition: 'none' }}>
                              <div
                                className="flex items-center justify-center rounded-lg p-2"
                                style={{
                                  backgroundColor: isSelected
                                    ? action.id === 'delete'
                                      ? 'rgba(239, 68, 68, 0.16)'
                                      : action.active
                                        ? action.color
                                        : theme === 'dark'
                                          ? 'rgba(71, 85, 105, 0.55)'
                                          : '#f1f1f1'
                                    : 'transparent',
                                  color: action.id === 'delete'
                                    ? '#ef4444'
                                    : isSelected && action.active
                                      ? 'white'
                                      : action.color,
                                  transition: 'none',
                                }}
                              >
                                <Icon size={20} style={{ color: action.id === 'delete' ? '#ef4444' : isSelected && action.active ? 'white' : undefined }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
              </div>
            )}
          </div>

          {/* Прогресс подзадач */}
          {node.children.length > 0 && (
            <div
              className="relative mt-auto h-7 overflow-hidden dark:bg-gray-700/50"
              style={
                theme === 'light'
                  ? { backgroundColor: 'rgba(var(--accent-rgb), 0.11)' }
                  : undefined
              }
            >
              <div
                className={`h-full transition-all duration-500 ${isBlinking ? 'animate-pulse' : ''}`}
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.4)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className={`text-xs font-semibold ${progress > 50 ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                  {getProgressCounts(node).completed} / {getProgressCounts(node).total}
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {isBurning && effectsEnabled && (
          <div className="absolute inset-0 z-[60] pointer-events-none overflow-visible">
            {/* Эффект разреза (белая линия) */}
            <motion.div
              className="absolute inset-0 z-[70] bg-white dark:bg-gray-200 shadow-[0_0_15px_white] dark:shadow-[0_0_15px_rgba(255,255,255,0.5)]"
              style={{ 
                clipPath: 'polygon(45% 0%, 55% 0%, 40% 20%, 50% 40%, 35% 60%, 45% 80%, 35% 100%, 30% 100%, 40% 80%, 30% 60%, 45% 40%, 35% 20%, 45% 0%)',
                width: '4px',
                left: '50%',
                marginLeft: '-2px',
                originY: 0
              }}
              initial={{ scaleY: 0, opacity: 1 }}
              animate={{ 
                scaleY: [0, 1.2, 1.2],
                opacity: [1, 1, 0],
              }}
              transition={{ 
                duration: 0.4, 
                times: [0, 0.5, 1],
                ease: "easeInOut" 
              }}
            />

            {/* Левая половина */}
            <motion.div
              className="absolute inset-y-0 left-0 w-1/2 rounded-l-lg bg-white shadow-xl dark:bg-gray-800"
              style={{ 
                clipPath: 'polygon(0% 0%, 100% 0%, 85% 20%, 100% 40%, 80% 60%, 100% 80%, 90% 100%, 0% 100%)',
                backgroundColor: node.completed ? 'rgba(var(--accent-rgb), 0.05)' : undefined
              }}
              initial={{ x: 0, y: 0, rotate: 0 }}
              animate={{ 
                x: [0, -20, -150], 
                y: [0, 0, 800], 
                rotate: [0, -2, -35],
              }}
              transition={{ 
                duration: 1.2, 
                times: [0, 0.3, 1],
                ease: [0.45, 0, 0.55, 1],
                delay: 0.2
              }}
            >
              <div className="p-4 w-[200%]">
                <span className="font-semibold" style={{ color: 'var(--accent)' }}>{node.title}</span>
              </div>
            </motion.div>

            {/* Правая половина */}
            <motion.div
              className="absolute inset-y-0 right-0 w-1/2 rounded-r-lg bg-white shadow-xl dark:bg-gray-800"
              style={{ 
                clipPath: 'polygon(15% 0%, 100% 0%, 100% 100%, 10% 100%, 20% 80%, 0% 60%, 15% 40%, 0% 20%)',
                backgroundColor: node.completed ? 'rgba(var(--accent-rgb), 0.05)' : undefined
              }}
              initial={{ x: 0, y: 0, rotate: 0 }}
              animate={{ 
                x: [0, 20, 180], 
                y: [0, 0, 850], 
                rotate: [0, 2, 45],
              }}
              transition={{ 
                duration: 1.2, 
                times: [0, 0.3, 1],
                ease: [0.45, 0, 0.55, 1],
                delay: 0.2
              }}
            >
              <div className="p-4 w-[200%] -ml-[100%]">
                <div className="flex justify-end pr-10">
                   <FiTrash2 size={24} color="#ef4444" />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {isDragging && draggedNode?.id === node.id && (
        <div
          className="fixed pointer-events-none z-50 opacity-50 transform scale-50"
          style={{
            left: dragPosition.x - 150,
            top: dragPosition.y - 50,
            width: '300px'
          }}
        >
          <div className="rounded-lg bg-white p-3 shadow-xl dark:bg-gray-800">
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

      {isLongPressing && (
        <div 
          className="fixed pointer-events-none z-[110]"
          style={{
            left: longPressPos.x - 30,
            top: longPressPos.y - 30,
            width: '30px',
            height: '30px'
          }}
        >
          <svg width="30" height="30" viewBox="0 0 40 40" className="drop-shadow-sm">
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
