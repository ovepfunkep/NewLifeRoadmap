import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Z_MODAL } from '../config/zLayers';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionDurations, motionTransitions } from '../config/motion';
import { DashboardContent } from './DashboardContent';

interface DashboardModalProps {
  initialNodeId: string;
  onClose: () => void;
}

export function DashboardModal({ initialNodeId, onClose }: DashboardModalProps) {
  const { allowEssentialMotion } = useMotionPreferences();
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ inside: boolean } | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    clickStartRef.current = {
      inside: modalRef.current?.contains(e.target as globalThis.Node) || false,
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!clickStartRef.current?.inside) {
      const endedInside = modalRef.current?.contains(e.target as globalThis.Node) || false;
      if (!endedInside) onClose();
    }
    clickStartRef.current = null;
  };

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: Z_MODAL }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
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
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        initial={allowEssentialMotion ? { y: 20, scale: 0.98, opacity: 0.92 } : { opacity: 1 }}
        animate={allowEssentialMotion ? { y: 0, scale: 1, opacity: 1 } : { opacity: 1 }}
        exit={allowEssentialMotion ? { y: 20, scale: 0.98, opacity: 0 } : { opacity: 0 }}
        transition={
          allowEssentialMotion
            ? motionTransitions.modal
            : { duration: motionDurations.fast }
        }
      >
        <DashboardContent
          initialNodeId={initialNodeId}
          onClose={onClose}
          showCloseButton={true}
          className="mx-2 flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:mx-4 dark:border-gray-700 dark:bg-slate-900"
        />
      </motion.div>
    </motion.div>
  );
}
