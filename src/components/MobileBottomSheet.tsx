import { useEffect } from 'react';
import { AnimatePresence, motion, PanInfo, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import { motionDurations, motionTransitions } from '../config/motion';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { Z_MODAL } from '../config/zLayers';

interface MobileBottomSheetProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Меньше отступы у ручки и контента (редактор и т.п.) */
  compact?: boolean;
}

export function MobileBottomSheet({ isOpen, title, onClose, children, compact }: MobileBottomSheetProps) {
  const { allowEssentialMotion } = useMotionPreferences();
  const dragControls = useDragControls();

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 700) {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, onClose]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 flex items-end bg-black/40 backdrop-blur-[1px]"
          style={{ zIndex: Z_MODAL }}
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            allowEssentialMotion
              ? motionTransitions.fade
              : { duration: motionDurations.fast }
          }
        >
          <motion.div
            className={`w-full rounded-t-2xl bg-white shadow-xl dark:bg-gray-800 lg:rounded-t-xl ${
              compact ? 'px-3 pb-4 pt-2' : 'px-4 pb-6 pt-3'
            }`}
            onMouseDown={(event) => event.stopPropagation()}
            initial={allowEssentialMotion ? { y: '100%', opacity: 0.9 } : { opacity: 1 }}
            animate={allowEssentialMotion ? { y: 0, opacity: 1 } : { opacity: 1 }}
            exit={allowEssentialMotion ? { y: '100%', opacity: 0.9 } : { opacity: 0 }}
            transition={
              allowEssentialMotion
                ? motionTransitions.sheet
                : { duration: motionDurations.fast }
            }
            drag={allowEssentialMotion ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragElastic={{ top: 0, bottom: 0.24 }}
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={handleDragEnd}
          >
            <button
              type="button"
              onPointerDown={(event) => {
                if (!allowEssentialMotion) return;
                dragControls.start(event);
              }}
              className={`${compact ? 'mb-2' : 'mb-4'} flex w-full cursor-grab justify-center touch-none active:cursor-grabbing`}
              aria-label="Drag down to close"
            >
              <span className="h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
            </button>
            {title && <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, document.body);
}
