import {
  Children,
  cloneElement,
  type FocusEvent,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Z_TOOLTIP } from '../config/zLayers';

type Position = 'left' | 'right' | 'top' | 'bottom';

export interface TooltipProps {
  text: string | ReactNode;
  children: ReactElement;
  position?: Position;
  multiline?: boolean;
  /** false — только children (без подсказки), для моб. радиального меню и т.п. */
  enabled?: boolean;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'function') (ref as (v: T | null) => void)(value);
      else (ref as MutableRefObject<T | null>).current = value;
    });
  };
}

function chain<E extends { nativeEvent: unknown }>(
  a: ((e: E) => void) | undefined,
  b: (e: E) => void
) {
  return (e: E) => {
    a?.(e);
    b(e);
  };
}

/** Общий вид «карточки» подсказки (как у радиального виджета настроек) */
const tooltipSurfaceClass =
  'text-xs font-medium text-gray-700 dark:text-gray-200 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm px-2.5 py-1.5 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600';

export function Tooltip({
  text,
  children,
  position = 'top',
  multiline = false,
  enabled = true,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip || !open) return;

    const ar = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const pos: Position = position === 'right' && vw >= 768 ? 'top' : position;

    let left = 0;
    let top = 0;

    if (pos === 'top') {
      const aboveTop = ar.top - tr.height - gap;
      const preferAbove = aboveTop >= pad;
      top = preferAbove ? aboveTop : ar.bottom + gap;
      left = ar.left + ar.width / 2 - tr.width / 2;
    } else if (pos === 'bottom') {
      const belowBottom = ar.bottom + gap + tr.height;
      const preferBelow = belowBottom <= vh - pad;
      top = preferBelow ? ar.bottom + gap : ar.top - tr.height - gap;
      left = ar.left + ar.width / 2 - tr.width / 2;
    } else if (pos === 'left') {
      left = ar.left - tr.width - gap;
      top = ar.top + ar.height / 2 - tr.height / 2;
      if (left < pad) left = ar.right + gap;
    } else {
      left = ar.right + gap;
      top = ar.top + ar.height / 2 - tr.height / 2;
      if (left + tr.width > vw - pad) left = ar.left - tr.width - gap;
    }

    left = clamp(left, pad, Math.max(pad, vw - tr.width - pad));
    top = clamp(top, pad, Math.max(pad, vh - tr.height - pad));
    setCoords({ left, top });
  }, [open, position]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, text, position, multiline, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const ro = () => updatePosition();
    window.addEventListener('scroll', ro, true);
    window.addEventListener('resize', ro);
    return () => {
      window.removeEventListener('scroll', ro, true);
      window.removeEventListener('resize', ro);
    };
  }, [open, updatePosition]);

  if (!enabled) {
    return children;
  }

  const child = Children.only(children) as ReactElement<{
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: (e: MouseEvent) => void;
    onFocus?: (e: FocusEvent) => void;
    onBlur?: (e: FocusEvent) => void;
  }> & { ref?: Ref<HTMLElement> };
  const childRef = child.ref;

  const trigger = cloneElement(child as any, {
    ref: mergeRefs(anchorRef, childRef),
    onMouseEnter: chain(child.props.onMouseEnter, () => setOpen(true)),
    onMouseLeave: chain(child.props.onMouseLeave, () => setOpen(false)),
    onFocus: chain(child.props.onFocus, () => setOpen(true)),
    onBlur: chain(child.props.onBlur, (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!anchorRef.current?.contains(next)) setOpen(false);
    }),
  } as any);

  const layoutClass = multiline
    ? 'whitespace-normal text-left min-w-[150px]'
    : 'whitespace-nowrap';

  return (
    <>
      {trigger}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              zIndex: Z_TOOLTIP,
              left: coords?.left ?? 0,
              top: coords?.top ?? 0,
              opacity: coords ? 1 : 0,
              transition: 'opacity 0.12s ease-out',
              pointerEvents: 'none',
            }}
            className={`${tooltipSurfaceClass} max-w-[min(90vw,20rem)] ${layoutClass}`}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
