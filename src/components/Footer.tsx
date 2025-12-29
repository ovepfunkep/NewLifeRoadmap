import { FiGithub } from 'react-icons/fi';
import { FaTelegram } from 'react-icons/fa';
import { Tooltip } from './Tooltip';
import { AuthAvatar } from './AuthAvatar';
import { t } from '../i18n';
import { useEffect, useState } from 'react';

export function Footer() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <footer className="border-t border-gray-200 dark:border-gray-700 mt-auto bg-transparent">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-4">
            <AuthAvatar />
            <Tooltip text={t('tooltip.telegram')}>
              <a
                href="https://t.me/IncludeIntelligence"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 sm:p-2 rounded-lg transition-all hover:bg-accent/10 hover:brightness-150"
                style={{ color: 'var(--accent)' }}
              >
                <FaTelegram size={22} className="sm:w-5 sm:h-5" />
              </a>
            </Tooltip>
            <Tooltip text={t('tooltip.github')}>
              <a
                href="https://github.com/ovepfunkep/NewLifeRoadmap"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 sm:p-2 rounded-lg transition-all hover:bg-accent/10 hover:brightness-150"
                style={{ color: 'var(--accent)' }}
              >
                <FiGithub size={22} className="sm:w-5 sm:h-5" />
              </a>
            </Tooltip>
          </div>
          {!isMobile && (
            <div className="flex items-center gap-6">
              <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                <div>{t('keyboard.esc')}</div>
                <div>{t('keyboard.addStep')}</div>
                <div>{t('keyboard.edit')}</div>
              </div>
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 self-center"></div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                <div>{t('keyboard.move')}</div>
                <div>{t('keyboard.import')}</div>
                <div>{t('keyboard.delete')}</div>
              </div>
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 self-center"></div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                <div>{t('keyboard.complete')}</div>
                <div>{t('keyboard.crtlNumber')}</div>
                <div>{t('keyboard.number')}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}

