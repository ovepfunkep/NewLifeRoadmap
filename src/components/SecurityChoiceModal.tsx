import React from 'react';
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
              <h2 className="text-xl font-bold dark:text-white">Настройка безопасности</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-tight">
                Ваши данные шифруются в браузере (E2EE). Выберите место хранения ключа:
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Вариант 1: Google Drive */}
            <button
              onClick={() => onChoice('gdrive')}
              className="w-full flex items-center gap-4 p-4 text-left rounded-xl border-2 border-transparent bg-gray-50 dark:bg-gray-700/50 hover:bg-accent/5 hover:border-accent transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm text-accent" style={{ color: 'var(--accent)' }}>
                <FiHardDrive size={20} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm dark:text-white flex items-center gap-2">
                  Усиленная защита
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ключ на вашем Google Drive</p>
              </div>
            </button>

            {/* Вариант 2: Firestore */}
            <button
              onClick={() => onChoice('firestore')}
              className="w-full flex items-center gap-4 p-4 text-left rounded-xl border-2 border-transparent bg-gray-50 dark:bg-gray-700/50 hover:bg-accent/5 hover:border-accent transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm text-gray-400">
                <FiLock size={20} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm dark:text-white">Стандартная защита</div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ключ на облачном хранилище сайта</p>
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
