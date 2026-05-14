import { useEffect, useState } from 'react';
import { FiGithub, FiDollarSign, FiLogIn, FiLogOut, FiExternalLink } from 'react-icons/fi';
import { FaTelegramPlane } from 'react-icons/fa';
import { useAccent } from '../hooks/useAccent';
import { useEffects } from '../hooks/useEffects';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../i18n';
import { recreateTutorial } from '../db';
import { useToast } from '../hooks/useToast';
import { getCurrentUser, onAuthChange, signInWithGoogle, signOutUser } from '../firebase/auth';
import { setupSecurity } from '../utils/securityManager';
import { SecurityChoiceModal } from './SecurityChoiceModal';
import { CopyrightNotice } from './CopyrightNotice';
import { SupportAuthorModal } from './SupportAuthorModal';
import { Tooltip } from './Tooltip';
import { WeeklyLocalBackupSettingsBlock } from './WeeklyLocalBackupSettingsBlock';
import { BOOSTY_SUPPORT_URL } from '../utils/constants';
import { SettingsGroup, SettingsRow, SettingsSection } from './mobileSettings/MobileSettingsLayout';

export function MobileSettingsTab() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { accent, setAccent, colors } = useAccent();
  const { effectsEnabled, setEffectsEnabled } = useEffects();
  const { showToast } = useToast();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUserEmail(currentUser?.email || null);

    const unsubscribe = onAuthChange((firebaseUser) => {
      setUserEmail(firebaseUser?.email || null);
    });
    return () => unsubscribe();
  }, []);

  const handleRefreshMemory = async () => {
    try {
      await recreateTutorial();
      showToast(
        language === 'ru'
          ? 'Окей. Туториал добавлен в корень.'
          : 'Okay. Tutorial added to root.',
        undefined,
        { type: 'success' }
      );
      window.dispatchEvent(new CustomEvent('syncManager:dataUpdated'));
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err.message === 'DUPLICATE_TUTORIAL') {
        showToast(
          language === 'ru'
            ? 'Туториал уже есть в списке.'
            : 'Tutorial is already in the list.',
          undefined,
          { type: 'warning' }
        );
        return;
      }
      showToast(
        language === 'ru'
          ? 'Не получилось создать туториал. Попробуй ещё раз.'
          : 'Failed to recreate tutorial. Try again.',
        undefined,
        { type: 'error' }
      );
    }
  };

  const handleSignIn = () => {
    setShowSecurityModal(true);
  };

  const handleSecurityChoice = async (mode: 'gdrive' | 'firestore') => {
    try {
      setShowSecurityModal(false);
      const user = await signInWithGoogle(mode === 'gdrive');
      await setupSecurity(mode, user.uid);
    } catch (error) {
      showToast(t('toast.syncError'));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (error) {
      showToast(t('toast.syncError'));
    }
  };

  const handleSupportBoosty = async () => {
    try {
      await navigator.clipboard.writeText(BOOSTY_SUPPORT_URL);
      showToast(t('toast.supportLinkCopied'), undefined, { type: 'success' });
    } catch {
      showToast(t('toast.supportLinkCopyFail'), undefined, { type: 'warning' });
    }
    setSupportModalOpen(true);
  };

  const renderSwitch = (enabled: boolean, onToggle: () => void, ariaLabel: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        enabled ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
      }`}
      style={enabled ? { backgroundColor: 'var(--accent)' } : undefined}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );

  const linkRowClass =
    'flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-800 transition-colors hover:bg-black/[0.04] active:bg-black/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.05] dark:active:bg-white/[0.08]';

  return (
    <>
      <section className="space-y-6">
        <SettingsSection title={t('settingsTab.sectionAppearance')}>
          <SettingsGroup>
            <SettingsRow>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.darkTheme')}</p>
              {renderSwitch(theme === 'dark', () => setTheme(theme === 'dark' ? 'light' : 'dark'), t('settingsTab.darkTheme'))}
            </SettingsRow>
            <SettingsRow>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.effects')}</p>
              {renderSwitch(effectsEnabled, () => setEffectsEnabled(!effectsEnabled), t('settingsTab.effects'))}
            </SettingsRow>
            <SettingsRow>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.language')}</p>
              <div className="flex shrink-0 rounded-lg bg-gray-200/70 p-0.5 dark:bg-gray-900/55">
                {(['ru', 'en'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLanguage(value)}
                    className={`min-w-[2.5rem] rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                      language === value
                        ? 'text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                    style={language === value ? { backgroundColor: 'var(--accent)' } : undefined}
                  >
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>
            </SettingsRow>
            <div className="px-4 pb-4 pt-3">
              <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.accent')}</p>
              <div className="grid grid-cols-8 gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAccent(color)}
                    className={`h-8 w-8 rounded-lg transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      accent === color ? 'scale-110 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-gray-100 dark:ring-offset-gray-800' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`${t('settingsTab.accent')} ${color}`}
                  />
                ))}
              </div>
            </div>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title={t('settingsTab.sectionDeviceData')}>
          <SettingsGroup>
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => void handleRefreshMemory()}
                className="w-full rounded-xl bg-white/70 py-2.5 text-sm font-semibold text-gray-800 transition-opacity active:opacity-90 dark:bg-gray-900/45 dark:text-gray-100"
              >
                {t('settingsTab.addTutorial')}
              </button>
            </div>
            <div className="px-4 py-3">
              <WeeklyLocalBackupSettingsBlock variant="stacked" embedded />
            </div>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title={t('settingsTab.sectionAccount')}>
          <SettingsGroup>
            {userEmail ? (
              <SettingsRow>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200">{userEmail}</p>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <FiLogOut size={14} aria-hidden />
                  <span>{t('sync.signOut')}</span>
                </button>
              </SettingsRow>
            ) : (
              <div className="px-4 py-3">
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-90"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  <FiLogIn size={16} aria-hidden />
                  <span>{t('sync.signIn')}</span>
                </button>
              </div>
            )}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title={t('settingsTab.sectionLinks')}>
          <SettingsGroup>
            <a
              href="https://t.me/IncludeIntelligence"
              target="_blank"
              rel="noopener noreferrer"
              className={linkRowClass}
            >
              <FaTelegramPlane className="shrink-0" size={18} style={{ color: 'var(--accent)' }} aria-hidden />
              <span className="min-w-0 flex-1">{t('tooltip.telegram')}</span>
              <FiExternalLink className="shrink-0 opacity-50" size={16} aria-hidden />
            </a>
            <a
              href="https://github.com/ovepfunkep/NewLifeRoadmap"
              target="_blank"
              rel="noopener noreferrer"
              className={linkRowClass}
            >
              <FiGithub className="shrink-0" size={18} style={{ color: 'var(--accent)' }} aria-hidden />
              <span className="min-w-0 flex-1">{t('tooltip.github')}</span>
              <FiExternalLink className="shrink-0 opacity-50" size={16} aria-hidden />
            </a>
            <Tooltip text={t('tooltip.supportAuthor')}>
              <button type="button" onClick={handleSupportBoosty} className={linkRowClass}>
                <FiDollarSign className="shrink-0" size={18} style={{ color: 'var(--accent)' }} aria-hidden />
                <span className="min-w-0 flex-1 text-left">{t('support.modalTitle')}</span>
                <FiExternalLink className="shrink-0 opacity-50" size={16} aria-hidden />
              </button>
            </Tooltip>
          </SettingsGroup>
        </SettingsSection>

        {showSecurityModal && (
          <SecurityChoiceModal
            onChoice={handleSecurityChoice}
            onClose={() => setShowSecurityModal(false)}
          />
        )}

        <CopyrightNotice className="pt-2 text-center" />
      </section>
      {supportModalOpen && <SupportAuthorModal onClose={() => setSupportModalOpen(false)} />}
    </>
  );
}
