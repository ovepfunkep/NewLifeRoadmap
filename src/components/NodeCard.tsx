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
      const duration = 220; 
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
      
      if (totalDelta < 8 && (performance.now() - lastScrollEndTimeRef.current > 300)) {
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
  }, [isMobile, actions.length]);

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
          className={`bg-white dark:bg-gray-800 rounded-lg border transition-all overflow-hidden relative ${
            node.priority 
              ? 'border-[3px]' 
              : 'border-gray-300 dark:border-gray-700'
          } ${
            isDragOver ? 'ring-2 ring-offset-2' : ''
          } ${
            draggedNode && draggedNode.id !== node.id ? 'opacity-60' : ''
          }`}
          style={{
            ...(node.priority ? { borderColor: 'var(--accent)' } : {}),
            ...(node.completed ? { 
              opacity: 0.85, 
              backgroundColor: 'rgba(var(--accent-rgb), 0.03)',
              filter: 'grayscale(0.2)'
            } : {}),
            boxShadow: node.priority 
              ? '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)' 
              : '0 1px 2px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06)',
            ...(isDragOver ? { 
              boxShadow: `0 0 0 3px var(--accent), 0 4px 8px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.1)`, 
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
          <div className="flex items-stretch gap-0">
            <div
              className="flex-1 min-w-0 p-4"
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              <button
                onClick={(e) => {
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:opacity-75 transition-opacity line-clamp-2" style={{ color: 'var(--accent)' }}>
                      {node.title}
                    </span>
                  </div>
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
                      <span className="text-xs text-gray-600 dark:text-gray-400">{progress}%</span>
                    </div>
                  )}
                  {node.description && (
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {node.description}
                    </div>
                  )}
                </div>
              </button>
            </div>
            
            <div className="flex items-stretch gap-0 flex-shrink-0">
              {isMobile ? (
                <div ref={drumRef} className="relative flex items-center justify-center w-20 touch-none border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 overflow-hidden select-none min-h-[120px] max-h-[140px]">
                  <div className="flex flex-col items-center justify-center h-full relative" style={{ transform: `translateY(${offsetPx}px)`, transition: 'none' }}>
                    {Array.from({ length: 41 }, (_, i) => i - 20).map((offset) => {
                      const actionIndex = ((baseActionIndex + offset) % actions.length + actions.length) % actions.length;
                      const action = actions[actionIndex];
                      const Icon = action.icon;
                      const centerOffset = Math.round(-offsetPx / ITEM_HEIGHT);
                      const isSelected = offset === centerOffset;
                      const dist = Math.abs((offset * ITEM_HEIGHT) + offsetPx);
                      const scale = Math.max(0.6, 1.2 - (dist / (ITEM_HEIGHT * 2))); 
                      const opacity = isSelected ? 1 : Math.max(0, Math.min(0.5, (1 - (dist / (ITEM_HEIGHT * 3))) + 0.15));
                      if (dist > 150) return null;
                      return (
                        <div key={offset} className="absolute flex items-center justify-center" style={{ top: '50%', marginTop: `${offset * ITEM_HEIGHT - (ITEM_HEIGHT / 2)}px`, height: `${ITEM_HEIGHT}px`, width: '100%', transform: `scale(${scale})`, opacity: isSelected ? 1 : opacity, color: action.color, zIndex: isSelected ? 10 : 1, transition: 'none' }}>
                          <div className={`p-1.5 rounded-lg flex items-center justify-center ${isSelected ? 'border-2 shadow-sm' : ''}`} style={{ backgroundColor: isSelected && action.active ? action.color : 'transparent', borderColor: isSelected ? (action.active ? 'transparent' : 'currentColor') : 'transparent', color: isSelected && action.active ? 'white' : action.color, transition: 'none', ...(action.id === 'delete' && isSelected ? { borderColor: '#ef4444', color: '#ef4444' } : {}) }}>
                            <Icon size={18} style={{ color: isSelected && action.active ? 'white' : undefined }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white via-transparent to-white dark:from-gray-800 dark:via-transparent dark:to-gray-800 opacity-90" style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%)' }} />
                </div>
              ) : (
                <div className="flex items-center gap-1 p-4">
                  {actions.map((action) => (
                    <Tooltip key={action.id} text={action.label}>
                      <button onClick={(e) => { e.stopPropagation(); action.action(); }} className={`p-2 rounded-lg transition-all border hover:brightness-150 ${action.active ? 'border-transparent' : 'border-current hover:bg-accent/10'}`} style={{ color: action.color, backgroundColor: action.active ? action.color : 'transparent' }}>
                        {React.createElement(action.icon, { size: 18, style: { color: action.active ? 'white' : action.color } })}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          </div>
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
