import React, { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { computeProgress, getDeadlineColor, getProgressCounts, formatDeadline } from '../utils';
import { useDeadlineTicker } from '../hooks/useDeadlineTicker';
import { useEffects } from '../hooks/useEffects';
import { FiCheck, FiEdit2, FiTrash2, FiArrowUp, FiMove } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { motion, AnimatePresence } from 'framer-motion';

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
  const deadlineDisplay = formatDeadline(node.deadline);
  const { effectsEnabled } = useEffects();
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [justDragged, setJustDragged] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [longPressPos, setLongPressPos] = useState({ x: 0, y: 0 });
  
  const isBurning = isBurningProp;
  const isMovingOut = isMovingOutProp;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const ITEM_HEIGHT = 30; // Reduced height for better visibility

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

    const handleTouchMove = (e: TouchEvent) => {
      if (!drumIsDraggingRef.current) return;
      
      const touch = Array.from(e.touches).find(t => t.identifier === drumTouchIdRef.current);
      if (!touch) return;
      
      const y = touch.clientY;
      const delta = y - drumDragStartYRef.current;
      
      if (Math.abs(delta) > 5) {
        drumHasMovedRef.current = true;
      }

      const next = drumDragStartOffsetRef.current + delta;
      offsetPxRef.current = next;
      setOffsetPx(next);
      if (e.cancelable) e.preventDefault();
    };

    const handleTouchEndLike = (e?: TouchEvent) => {
      if (!drumIsDraggingRef.current) return;

      if (e && e.changedTouches) {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === drumTouchIdRef.current);
        if (!touch) return; 
      }

      drumIsDraggingRef.current = false;
      drumTouchIdRef.current = null;
      
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEndLike);
      window.removeEventListener('touchcancel', handleTouchEndLike);

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

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      drumTouchIdRef.current = touch.identifier;
      
      if (e.cancelable) e.preventDefault(); 
      e.stopPropagation(); 
      stopAnim();
      drumIsDraggingRef.current = true;
      drumHasMovedRef.current = false; 
      drumDragStartYRef.current = touch.clientY;
      drumDragStartOffsetRef.current = offsetPxRef.current;

      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEndLike, { passive: false });
      window.addEventListener('touchcancel', handleTouchEndLike, { passive: false });
    };

    const handleMouseDownNative = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      stopAnim();
      drumIsDraggingRef.current = true;
      drumHasMovedRef.current = false;
      drumDragStartYRef.current = e.clientY;
      drumDragStartOffsetRef.current = offsetPxRef.current;

      const handleMouseMoveMouse = (me: MouseEvent) => {
        if (!drumIsDraggingRef.current) return;
        const delta = me.clientY - drumDragStartYRef.current;
        if (Math.abs(delta) > 5) drumHasMovedRef.current = true;
        const next = drumDragStartOffsetRef.current + delta;
        offsetPxRef.current = next;
        setOffsetPx(next);
      };

      const handleMouseUpMouse = (me: MouseEvent) => {
        drumIsDraggingRef.current = false;
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

    drum.addEventListener('touchstart', handleTouchStart, { passive: false });
    drum.addEventListener('mousedown', handleMouseDownNative);

    return () => {
      stopAnim();
      drum.removeEventListener('touchstart', handleTouchStart);
      drum.removeEventListener('mousedown', handleMouseDownNative);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEndLike);
      window.removeEventListener('touchcancel', handleTouchEndLike);
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; 
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
            opacity: { duration: isMovingOut ? (effectsEnabled ? 0.4 : 0) : 0.3 },
          }}
          className={`bg-white dark:bg-gray-800 rounded-xl border transition-all overflow-visible relative flex flex-col min-h-[140px] hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:hover:shadow-[0_25px_50px_-12px_rgba(255,255,255,0.1)] ${
            node.priority 
              ? 'border-[3px]' 
              : 'border-gray-300 dark:border-gray-700'
          } ${
            isDragOver ? 'ring-2 ring-offset-2' : ''
          } ${
            draggedNode && draggedNode.id !== node.id ? 'opacity-60' : ''
          } ${node.completed ? 'bg-accent/20 dark:bg-accent/30' : ''}`}
          style={{
            ...(node.priority ? { borderColor: 'var(--accent)' } : {}),
            ...(node.completed ? { 
              opacity: 1, 
              backgroundColor: 'rgba(var(--accent-rgb), 0.2)',
            } : {}),
            boxShadow: node.priority 
              ? '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' 
              : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            ...(isDragOver ? { 
              boxShadow: `0 0 0 3px var(--accent), 0 12px 24px rgba(0, 0, 0, 0.2), 0 8px 16px rgba(0, 0, 0, 0.1)`, 
              transition: 'all 0.3s ease'
            } : {}),
            ...(draggedNode && draggedNode.id !== node.id && (!currentNodeId || node.id !== currentNodeId) ? {
              borderColor: 'var(--accent)',
              opacity: 0.7
            } : {}),
            visibility: isBurning && effectsEnabled ? 'hidden' : 'visible'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleCardMouseUp}
          onTouchEnd={handleCardTouchEnd}
        >
          <div className="flex flex-col flex-1 relative">
            <div
              className={`flex-1 min-w-0 p-0 flex flex-col ${isMobile ? 'pr-16' : ''}`}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              <div className="flex items-center justify-between p-4 pb-2">
                <button
                  onClick={(e) => {
                    if (justDragged) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    onNavigate(node.id);
                  }}
                  className="flex-1 text-left group min-w-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold text-lg text-gray-900 dark:text-gray-100 group-hover:opacity-75 transition-opacity line-clamp-2" style={{ color: 'var(--accent)' }}>
                      {node.title}
                    </span>
                    {deadlineDisplay && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold border uppercase tracking-wider whitespace-nowrap"
                        style={{
                          borderColor: '#eab308',
                          color: 'black',
                          backgroundColor: '#eab308',
                        }}
                      >
                        {deadlineDisplay}
                      </span>
                    )}
                  </div>
                </button>

                {!isMobile && (
                  <div className="flex-shrink-0 ml-2 relative z-10 pt-1">
                    <div className="flex items-center gap-1.5">
                      {actions.map((action) => (
                        <Tooltip key={action.id} text={action.label}>
                          <button onClick={(e) => { e.stopPropagation(); action.action(); }} className={`p-2.5 rounded-lg transition-all border hover:scale-110 shadow-sm ${action.active ? 'border-transparent' : 'border-current hover:bg-accent/10'}`} style={{ color: action.color, backgroundColor: action.active ? action.color : 'transparent' }}>
                            {React.createElement(action.icon, { size: 20, style: { color: action.active ? 'white' : action.color } })}
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => onNavigate(node.id)}
                className="w-full text-left px-4 pb-10 flex-1 min-h-[40px]"
              >
                {node.description && (
                  <div className="text-[12px] font-normal text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">
                    {node.description}
                  </div>
                )}
              </button>
            </div>

            {/* Барабан для мобильных - центрирован по высоте контента без прогресс-бара */}
            {isMobile && (
              <div className="absolute right-2 top-0 bottom-7 flex items-center z-20 pointer-events-none">
                    <div 
                      ref={drumRef} 
                      className="relative flex items-center justify-center w-14 h-full select-none rounded-lg overflow-hidden pointer-events-auto touch-none"
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
                          const scale = Math.max(0.6, 1.2 - (dist / (ITEM_HEIGHT * 2))); 
                          
                          // Smooth opacity: 1.0 at center, 0.6 at neighbor (30px), 0.0 at next (60px)
                          const opacity = isSelected ? 1 : Math.max(0, 0.6 - ((dist - ITEM_HEIGHT) / ITEM_HEIGHT) * 0.6);
                          
                          if (opacity <= 0) return null;
                          
                          return (
                            <div key={offset} className="absolute flex items-center justify-center" style={{ top: '50%', marginTop: `${offset * ITEM_HEIGHT - (ITEM_HEIGHT / 2)}px`, height: `${ITEM_HEIGHT}px`, width: '100%', transform: `scale(${scale})`, opacity: opacity, color: action.color, zIndex: isSelected ? 10 : 1, transition: 'none' }}>
                              <div className={`p-1 rounded-lg flex items-center justify-center ${isSelected ? 'border-2 shadow-sm' : ''}`} style={{ backgroundColor: isSelected && action.active ? action.color : 'transparent', borderColor: isSelected ? (action.active ? 'transparent' : 'currentColor') : 'transparent', color: isSelected && action.active ? 'white' : action.color, transition: 'none', ...(action.id === 'delete' && isSelected ? { borderColor: '#ef4444', color: '#ef4444' } : {}) }}>
                                <Icon size={16} style={{ color: isSelected && action.active ? 'white' : undefined }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
              </div>
            )}
          </div>

          {/* Прогресс бар в самом низу */}
          {node.children.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-7 bg-gray-100 dark:bg-gray-700/50 overflow-hidden border-t border-gray-200 dark:border-gray-700 rounded-b-xl">
              <div
                className={`h-full transition-all duration-500 ${isBlinking ? 'animate-pulse' : ''}`}
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.4)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className={`text-xs font-normal opacity-40 ${progress > 50 ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
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
              className="absolute inset-0 z-[70] bg-white shadow-[0_0_15px_white]"
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
              className="absolute inset-y-0 left-0 w-1/2 bg-white dark:bg-gray-800 border-y border-l border-gray-300 dark:border-gray-700 rounded-l-lg shadow-xl"
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
              className="absolute inset-y-0 right-0 w-1/2 bg-white dark:bg-gray-800 border-y border-r border-gray-300 dark:border-gray-700 rounded-r-lg shadow-xl"
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
