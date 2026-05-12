import { FiGithub, FiDollarSign, FiSettings } from 'react-icons/fi';
import { FaTelegram } from 'react-icons/fa';
import { Tooltip } from './Tooltip';
import { AuthAvatar } from './AuthAvatar';
import { CopyrightNotice } from './CopyrightNotice';
import { SupportAuthorModal } from './SupportAuthorModal';
import { t } from '../i18n';
import { BOOSTY_SUPPORT_URL } from '../utils/constants';
import { useToast } from '../hooks/useToast';
import { useEffect, useState } from 'react';

interface FooterProps {
  onOpenSettings?: () => void;
}

export function Footer({ onOpenSettings }: FooterProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const { showToast } = useToast();

  const handleSupportAuthor = async () => {
    try {
      await navigator.clipboard.writeText(BOOSTY_SUPPORT_URL);
      showToast(t('toast.supportLinkCopied'), undefined, { type: 'success' });
    } catch {
      showToast(t('toast.supportLinkCopyFail'), undefined, { type: 'warning' });
    }
    setSupportOpen(true);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-auto bg-transparent">
      <div className="container mx-auto px-4 py-4 lg:px-2 xl:px-4">
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
            <Tooltip text={t('tooltip.supportAuthor')}>
              <button
                type="button"
                onClick={handleSupportAuthor}
                aria-label={t('support.modalTitle')}
                className="p-3 sm:p-2 rounded-lg transition-all hover:bg-accent/10 hover:brightness-150"
                style={{ color: 'var(--accent)' }}
              >
                <FiDollarSign size={22} className="sm:w-5 sm:h-5" />
              </button>
            </Tooltip>
            {isMobile && onOpenSettings && (
              <Tooltip text={t('footer.settings')}>
                <button
                  onClick={onOpenSettings}
                  className="p-3 rounded-lg transition-all hover:bg-accent/10 hover:brightness-150"
                  style={{ color: 'var(--accent)' }}
                >
                  <FiSettings size={22} />
                </button>
              </Tooltip>
            )}
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
        <CopyrightNotice className="mt-3 text-center sm:text-left" />
      </div>
    </footer>
      {supportOpen && <SupportAuthorModal onClose={() => setSupportOpen(false)} />}
    </>
  );
}

