import { useRef, useEffect } from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import { t } from '../i18n';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isDangerous = true,
}: ConfirmDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className={`mb-6 p-4 rounded-full ${isDangerous ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
              <FiAlertTriangle size={32} />
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {title}
            </h3>
            
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              {message}
            </p>

            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <FiX size={20} />
            </button>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-6 py-3 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all font-semibold border border-gray-200 dark:border-gray-700"
            >
              {cancelText || t('general.cancel')}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-6 py-3 rounded-2xl text-white transition-all font-bold shadow-lg active:scale-95 ${
                isDangerous
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                  : 'bg-accent hover:brightness-110 shadow-accent/20'
              }`}
              style={!isDangerous ? { backgroundColor: 'var(--accent)' } : {}}
            >
              {confirmText || (isDangerous ? t('general.delete') : t('general.save'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



