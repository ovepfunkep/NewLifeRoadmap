import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Node } from '../../types';

type SetDragOver = Dispatch<SetStateAction<string | null>>;

/**
 * While a step card is being dragged, tracks pointer position for auto-scroll,
 * hit-tests [data-node-id] targets, and updates drag-over highlight.
 * Touch and HTML5 drag are both wired at window level.
 */
export function useNodeDragGlobalListeners(options: {
  draggedNode: Node | null;
  /** Hash route / current folder id — cannot drop onto self. */
  routeNodeId: string | null | undefined;
  setDragOverNodeId: SetDragOver;
}): { lastTouchPositionRef: MutableRefObject<{ x: number; y: number } | null> } {
  const { draggedNode, routeNodeId, setDragOverNodeId } = options;
  const lastTouchPositionRef = useRef<{ x: number; y: number } | null>(null);
  const scrollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!draggedNode) {
      if (scrollIntervalRef.current) {
        window.clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      lastTouchPositionRef.current = null;
      return;
    }

    let lastHoveredNodeId: string | null = null;

    scrollIntervalRef.current = window.setInterval(() => {
      if (!lastTouchPositionRef.current) return;

      const { y } = lastTouchPositionRef.current;
      const threshold = 100;
      const maxSpeed = 15;
      const h = window.innerHeight;

      if (y < threshold) {
        const intensity = (threshold - y) / threshold;
        window.scrollBy(0, -maxSpeed * intensity);
      } else if (y > h - threshold) {
        const intensity = (y - (h - threshold)) / threshold;
        window.scrollBy(0, maxSpeed * intensity);
      }
    }, 16);

    const handleDragMove = (x: number, y: number) => {
      lastTouchPositionRef.current = { x, y };

      const allCards = document.querySelectorAll('[data-node-id]');
      let foundCard: HTMLElement | null = null;

      for (const card of allCards) {
        const htmlCard = card as HTMLElement;
        const nodeIdAttr = htmlCard.getAttribute('data-node-id');

        if (!nodeIdAttr || nodeIdAttr === draggedNode.id) continue;

        const rect = htmlCard.getBoundingClientRect();
        const isInside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

        if (isInside) {
          foundCard = htmlCard;
          break;
        }
      }

      if (foundCard) {
        const hoveredNodeId = foundCard.getAttribute('data-node-id');

        if (!hoveredNodeId) {
          if (lastHoveredNodeId) {
            setDragOverNodeId(null);
            lastHoveredNodeId = null;
          }
          return;
        }

        if (routeNodeId && hoveredNodeId === routeNodeId) {
          if (lastHoveredNodeId) {
            setDragOverNodeId(null);
            lastHoveredNodeId = null;
          }
          return;
        }

        if (hoveredNodeId !== lastHoveredNodeId) {
          lastHoveredNodeId = hoveredNodeId;
          setDragOverNodeId(hoveredNodeId);
        }
      } else {
        if (lastHoveredNodeId) {
          setDragOverNodeId(null);
          lastHoveredNodeId = null;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handleDragOver = (e: DragEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('dragover', handleDragOver);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('dragover', handleDragOver);
      if (scrollIntervalRef.current) {
        window.clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      lastTouchPositionRef.current = null;
    };
  }, [draggedNode, routeNodeId, setDragOverNodeId]);

  return { lastTouchPositionRef };
}
