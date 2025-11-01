import React, { useState, useEffect } from 'react';
import { Toast } from '../hooks/useToast';
import { t } from '../i18n';

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

function ToastItem({ toast, onRemove, onUndo }: ToastItemProps) {
  const [progress, setProgress] = useState(100);
  const hasUndo = !!toast.undo;
  const duration = hasUndo ? 5000 : 3000;

  useEffect(() => {
    if (!hasUndo) return;

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
  }, [toast.id, toast.createdAt, duration, hasUndo, onRemove]);

  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 min-w-[300px] flex items-center justify-between gap-3 overflow-hidden">
      {/* Прогресс бар по обводке */}
      {hasUndo && (
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

      <span className="text-sm text-gray-900 dark:text-gray-100 relative z-10">
        {toast.message}
      </span>

      {toast.undo && (
        <button
          onClick={() => {
            toast.undo?.();
            onRemove(toast.id);
          }}
          className="text-sm font-medium px-3 py-1.5 rounded-xl transition-colors relative z-10"
          style={{ 
            backgroundColor: 'var(--accent)',
            color: 'white'
          }}
        >
          {t('toast.undo')}
        </button>
      )}

      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 relative z-10 text-xl leading-none"
      >
        ×
      </button>
    </div>
  );
}
