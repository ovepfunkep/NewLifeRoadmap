import { useState, useEffect } from 'react';
import { Toast } from '../hooks/useToast';
import { t } from '../i18n';
import { FiLoader, FiCheck } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

interface ToastListProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
  onUndo?: (id: string) => void;
}

export function ToastList({ toasts, onRemove, onUndo }: ToastListProps) {
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2 flex flex-col items-center w-full max-w-[90vw] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            layout
            className="pointer-events-auto"
          >
            <ToastItem
              toast={toast}
              onRemove={onRemove}
              onUndo={onUndo}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
  onUndo?: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [progress, setProgress] = useState(100);
  const hasUndo = !!toast.undo;
  const duration = 3000; // 3 секунды для всех тостов
  const isPersistent = toast.persistent === true;
  const showIcon = toast.isLoading !== undefined || toast.isSuccess !== undefined;
  const showProgressBar = !isPersistent && !toast.isLoading; // Показываем прогресс для всех не persistent тостов

  const typeStyles = {
    success: 'border-accent bg-accent/5 dark:bg-accent/10 shadow-accent/10',
    warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10 shadow-yellow-500/10',
    error: 'border-red-500/50 bg-red-50 dark:bg-red-900/10 shadow-red-500/10',
    default: 'border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md'
  };

  const typeColors = {
    success: 'var(--accent)',
    warning: '#eab308',
    error: '#ef4444',
    default: 'var(--accent)'
  };

  const currentType = toast.type || 'default';
  const color = typeColors[currentType];

  useEffect(() => {
    // Если тост успешно завершен, показываем его 3 секунды и закрываем
    if (toast.isSuccess && !toast.isLoading) {
      const successDuration = 3000; 
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / successDuration) * 100);
        setProgress(remaining);
      }, 16);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        onRemove(toast.id);
      }, successDuration);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    if (isPersistent || toast.isLoading) return;

    const startTime = toast.createdAt;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
    }, 16);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      onRemove(toast.id);
    }, duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [toast.id, toast.createdAt, duration, hasUndo, isPersistent, toast.isLoading, toast.isSuccess, onRemove]);

  return (
    <div 
      className={`relative rounded-2xl shadow-lg border min-w-[300px] max-w-[400px] flex flex-col overflow-hidden transition-shadow duration-300 ${
        typeStyles[currentType]
      } ${
        !isPersistent && !toast.isLoading ? 'cursor-pointer hover:shadow-xl' : ''
      }`}
      onClick={() => {
        if (!isPersistent && !toast.isLoading) {
          onRemove(toast.id);
        }
      }}
    >
      {/* Контент тоста */}
      <div className="flex items-center justify-between gap-3 p-4 relative z-10">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 block truncate">
            {toast.message}
          </span>
          {toast.isLoading && (
            <span className="text-xs text-gray-500 dark:text-gray-400 opacity-60 block mt-1 animate-pulse">
              {t('toast.syncingCloud')}
            </span>
          )}
          {toast.subtitle && !toast.isLoading && (
            <span className="text-xs text-gray-500 dark:text-gray-400 opacity-60 block mt-1">
              {toast.subtitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {showIcon && (
            <div className="flex-shrink-0">
              {toast.isLoading && (
                <FiLoader 
                  size={20} 
                  className="animate-spin" 
                  style={{ color }}
                />
              )}
              {toast.isSuccess && !toast.isLoading && (
                <FiCheck 
                  size={20} 
                  style={{ color }}
                  className="transition-opacity"
                />
              )}
            </div>
          )}
          {toast.undo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toast.undo?.();
                onRemove(toast.id);
              }}
              className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all text-white hover:brightness-110 active:scale-95 shadow-md"
              style={{ 
                backgroundColor: color
              }}
            >
              {t('toast.undo')}
            </button>
          )}
        </div>
      </div>

      {/* Прогресс-бар внизу тоста */}
      {showProgressBar && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200/50 dark:bg-gray-700/50 overflow-hidden rounded-b-2xl">
          <motion.div
            className="h-full"
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'tween', ease: 'linear', duration: 0.1 }}
            style={{
              backgroundColor: color,
            }}
          />
        </div>
      )}
    </div>
  );
}
