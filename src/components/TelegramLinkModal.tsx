import { useTranslation } from '../i18n';
import { TELEGRAM_BOT_USERNAME } from '../utils/constants';
import { getCurrentUser } from '../firebase/auth';

interface TelegramLinkModalProps {
  onClose: () => void;
}

export function TelegramLinkModal({ onClose }: TelegramLinkModalProps) {
  const t = useTranslation();
  const user = getCurrentUser();
  const tgUrl = user ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${user.uid}` : `https://t.me/${TELEGRAM_BOT_USERNAME}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <span className="text-2xl">🤖</span> {t('telegram.linking')}
        </h2>
        
        <div className="space-y-4 text-gray-600 dark:text-gray-400">
          <p className="text-sm leading-relaxed">
            {t('telegram.modalInfo1') || 'Для получения уведомлений необходимо привязать ваш Telegram аккаунт.'}
          </p>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">
              ⚠️ {t('telegram.modalWarningTitle') || 'Важная информация:'}
            </p>
            <ul className="list-disc list-inside text-xs space-y-2 text-blue-700 dark:text-blue-400">
              <li>{t('telegram.modalInfo2') || 'Привязка происходит при нажатии кнопки "START" в нашем боте.'}</li>
              <li>{t('telegram.modalInfo3') || 'В силу бесплатного решения уведомления отправляются с задержкой до 20 минут.'}</li>
              <li>{t('telegram.modalInfo4') || 'Мы будем отправлять уведомления заранее, чтобы вы точно ничего не пропустили.'}</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <a
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-accent text-white rounded-xl font-bold text-center hover:brightness-110 transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('telegram.openBot') || 'Открыть Telegram'}
          </a>
          <button
            onClick={onClose}
            className="w-full py-3 text-gray-500 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            {t('general.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

