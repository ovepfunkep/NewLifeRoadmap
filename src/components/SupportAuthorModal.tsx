import { useTranslation } from '../i18n';
import { BOOSTY_SUPPORT_URL } from '../utils/constants';
import { Z_MODAL } from '../config/zLayers';

interface SupportAuthorModalProps {
  onClose: () => void;
}

export function SupportAuthorModal({ onClose }: SupportAuthorModalProps) {
  const t = useTranslation();
  const qrSrc = `${import.meta.env.BASE_URL}boosty-support-qr.png`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ zIndex: Z_MODAL }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-in zoom-in-95 max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl duration-200 dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="support-modal-title"
      >
        <h2 id="support-modal-title" className="mb-3 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
          <span className="text-2xl" aria-hidden>
            ☕
          </span>
          {t('support.modalTitle')}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{t('support.modalBody')}</p>
        <div className="mb-6 flex justify-center rounded-xl bg-white p-3 dark:bg-gray-900/50">
          <img
            src={qrSrc}
            alt=""
            width={220}
            height={220}
            className="h-auto max-w-full"
            draggable={false}
          />
        </div>
        <div className="flex flex-col gap-3">
          <a
            href={BOOSTY_SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-center font-bold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('support.openBoosty')}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            {t('general.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
