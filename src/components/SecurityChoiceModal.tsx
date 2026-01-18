import { FiShield, FiHardDrive, FiLock } from 'react-icons/fi';

interface SecurityChoiceModalProps {
  onChoice: (choice: 'gdrive' | 'firestore') => void;
}

export function SecurityChoiceModal({ onChoice }: SecurityChoiceModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in duration-300 border border-gray-100 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center shrink-0" style={{ color: 'var(--accent)' }}>
              <FiShield size={24} />
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Настройка безопасности</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-tight">
                Ваши данные шифруются в браузере (E2EE). Выберите место хранения ключа:
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Вариант 1: Firestore (Стандартная - РЕКОМЕНДУЕМАЯ) */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-accent via-blue-400 to-accent rounded-xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              <button
                onClick={() => onChoice('firestore')}
                className="relative w-full flex items-center gap-4 p-4 text-left rounded-xl border-2 border-accent/50 bg-white dark:bg-gray-800 hover:bg-accent/5 hover:border-accent transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 dark:bg-accent/20 flex items-center justify-center shadow-sm text-accent group-hover:scale-110 transition-transform" style={{ color: 'var(--accent)' }}>
                  <FiLock size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-sm text-gray-900 dark:text-white">Стандартная защита</div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent text-white font-bold uppercase tracking-wider">Рекомендуется</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Ключ на облачном хранилище сайта. Уведомления в Telegram с названием шага.</p>
                </div>
              </button>
            </div>

            {/* Вариант 2: Google Drive (Усиленная) */}
            <button
              onClick={() => onChoice('gdrive')}
              className="w-full flex items-center gap-4 p-4 text-left rounded-xl border-2 border-transparent bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all group opacity-80 hover:opacity-100"
            >
              <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm text-gray-400 group-hover:text-accent transition-colors">
                <FiHardDrive size={20} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  Усиленная защита
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Ключ на вашем Google Drive. Уведомления в Telegram без названия задач.</p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 p-4 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
            Никто не может прочитать ваши данные без вашего ключа
          </p>
        </div>
      </div>
    </div>
  );
}
