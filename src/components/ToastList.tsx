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
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2 flex flex-col items-center">
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
  const duration = 2500; // 2.5 секунды для всех тостов
  const isPersistent = toast.persistent === true;
  const showIcon = toast.isLoading !== undefined || toast.isSuccess !== undefined;
  const showProgressBar = !isPersistent && !toast.isLoading; // Показываем прогресс для всех не persistent тостов

  const typeStyles = {
    success: 'border-accent bg-accent/5 dark:bg-accent/10 shadow-accent/10',
    warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10 shadow-yellow-500/10',
    error: 'border-red-500/50 bg-red-50 dark:bg-red-900/10 shadow-red-500/10',
    default: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
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
    // Если тост успешно завершен, показываем его 2.5 секунды и закрываем
    if (toast.isSuccess && !toast.isLoading) {
      const successDuration = 2500; // 2.5 секунды
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / successDuration) * 100);
        setProgress(remaining);
      }, 16); // ~60fps

      const timeout = setTimeout(() => {
        clearInterval(interval);
        onRemove(toast.id);
      }, successDuration);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    // Не показываем прогресс для persistent тостов или тостов с загрузкой
    if (isPersistent || toast.isLoading) return;

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
    <div 
      className={`relative rounded-2xl shadow-lg border min-w-[300px] flex flex-col overflow-hidden transition-all duration-200 ${
        typeStyles[currentType]
      } ${
        !isPersistent && !toast.isLoading ? 'cursor-pointer hover:shadow-xl' : ''
      }`}
      onClick={() => {
        // Закрываем тост при клике, если он не persistent и не в процессе загрузки
        if (!isPersistent && !toast.isLoading) {
          onRemove(toast.id);
        }
      }}
    >
      {/* Контент тоста */}
      <div className="flex items-center justify-between gap-3 p-4 relative z-10">
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 block">
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Иконка загрузки или успеха */}
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
                e.stopPropagation(); // Предотвращаем закрытие тоста при клике на кнопку
                toast.undo?.();
                onRemove(toast.id);
              }}
              className="text-sm font-medium px-3 py-1.5 rounded-xl transition-colors text-white"
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
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 overflow-hidden rounded-b-2xl">
          <div
            className="h-full transition-all duration-75 ease-linear"
            style={{
              width: `${progress}%`,
              backgroundColor: color,
            }}
          />
        </div>
      )}
    </div>
  );
}
