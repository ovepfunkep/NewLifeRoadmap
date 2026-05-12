import { FiCheckCircle, FiCloudOff } from 'react-icons/fi';
import { useTranslation } from '../i18n';
import { Z_MODAL_HIGH } from '../config/zLayers';
import type { CloudFirestoreHealthEvent } from '../utils/cloudFirestoreHealth';

type Props = {
  variant: CloudFirestoreHealthEvent;
  onClose: () => void;
};

/** Одноразовое уведомление: облако недоступно или снова доступно (без второй кнопки «Отмена»). */
export function CloudAvailabilityNoticeModal({ variant, onClose }: Props) {
  const t = useTranslation();
  const isDown = variant === 'unavailable';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ zIndex: Z_MODAL_HIGH }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-notice-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800 sm:p-8 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              isDown
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-200'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-200'
            }`}
          >
            {isDown ? <FiCloudOff size={32} /> : <FiCheckCircle size={32} />}
          </div>
          <h2 id="cloud-notice-title" className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">
            {isDown ? t('cloud.unavailableTitle') : t('cloud.restoredTitle')}
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {isDown ? t('cloud.unavailableBody') : t('cloud.restoredBody')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99]"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('cloud.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
