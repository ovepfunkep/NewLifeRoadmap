import { useState, useEffect } from 'react';
import { Toast } from '../hooks/useToast';
import { t } from '../i18n';
import { FiLoader, FiCheck } from 'react-icons/fi';

interface ToastListProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
  onUndo?: (id: string) => void;
}

export function ToastList({ toasts, onRemove, onUndo }: ToastListProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={onRemove}
          onUndo={onUndo}
        />
      ))}
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
  const duration = hasUndo ? 5000 : 3000;
  const isPersistent = toast.persistent === true;
  const showIcon = toast.isLoading !== undefined || toast.isSuccess !== undefined;

  useEffect(() => {
    // Если тост успешно завершен, показываем его 0.5 секунды и закрываем
    if (toast.isSuccess && !toast.isLoading) {
      const timeout = setTimeout(() => {
        onRemove(toast.id);
      }, 500);
      return () => clearTimeout(timeout);
    }

    if (!hasUndo || isPersistent || toast.isLoading) return;

    const startTime = toast.createdAt;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
    }, 16); // ~60fps

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
    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 min-w-[300px] flex items-center justify-between gap-3 overflow-hidden">
      {/* Прогресс бар по обводке */}
      {hasUndo && !isPersistent && !toast.isLoading && (
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx="50%"
            cy="50%"
            r="calc(50% - 2px)"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-200 dark:text-gray-700"
          />
          <circle
            cx="50%"
            cy="50%"
            r="calc(50% - 2px)"
            fill="none"
            strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * (50 - 2)}`}
            strokeDashoffset={`${2 * Math.PI * (50 - 2) * (1 - progress / 100)}`}
            strokeLinecap="round"
            style={{ color: 'var(--accent)' }}
            className="transition-all duration-75"
          />
        </svg>
      )}

      <div className="flex-1 relative z-10">
        <span className="text-sm text-gray-900 dark:text-gray-100 block">
          {toast.message}
        </span>
        {toast.isLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400 opacity-60 block mt-1">
            {t('toast.syncingCloud')}
          </span>
        )}
        {toast.subtitle && !toast.isLoading && (
          <span className="text-xs text-gray-500 dark:text-gray-400 opacity-60 block mt-1">
            {toast.subtitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 relative z-10">
        {/* Иконка загрузки или успеха */}
        {showIcon && (
          <div className="flex-shrink-0">
            {toast.isLoading && (
              <FiLoader 
                size={20} 
                className="animate-spin" 
                style={{ color: 'var(--accent)' }}
              />
            )}
            {toast.isSuccess && !toast.isLoading && (
              <FiCheck 
                size={20} 
                style={{ color: 'var(--accent)' }}
                className="transition-opacity"
              />
            )}
          </div>
        )}
        {toast.undo && (
          <button
            onClick={() => {
              toast.undo?.();
              onRemove(toast.id);
            }}
            className="text-sm font-medium px-3 py-1.5 rounded-xl transition-colors"
            style={{ 
              backgroundColor: 'var(--accent)',
              color: 'white'
            }}
          >
            {t('toast.undo')}
          </button>
        )}
        {!isPersistent && !toast.isLoading && (
          <button
            onClick={() => onRemove(toast.id)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
