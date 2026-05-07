import { useEffect, useState } from 'react';
import { FiGithub, FiLogIn, FiLogOut } from 'react-icons/fi';
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

export function MobileSettingsTab() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { accent, setAccent, colors } = useAccent();
  const { effectsEnabled, setEffectsEnabled } = useEffects();
  const { showToast } = useToast();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUserEmail(currentUser?.email || null);

    const unsubscribe = onAuthChange((firebaseUser) => {
      setUserEmail(firebaseUser?.email || null);
    });
    return () => unsubscribe();
  }, []);

  // Recreates the onboarding tutorial node in the root list.
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

  const renderSwitch = (enabled: boolean, onToggle: () => void, ariaLabel: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.darkTheme')}</p>
          {renderSwitch(theme === 'dark', () => setTheme(theme === 'dark' ? 'light' : 'dark'), t('settingsTab.darkTheme'))}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.effects')}</p>
          {renderSwitch(effectsEnabled, () => setEffectsEnabled(!effectsEnabled), t('settingsTab.effects'))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.language')}</p>
        <div className="grid grid-cols-2 gap-2">
          {(['ru', 'en'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLanguage(value)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                language === value
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
              style={language === value ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('settingsTab.accent')}</p>
        <div className="grid grid-cols-8 gap-2">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setAccent(color)}
              className={`h-8 w-8 rounded-lg border-2 transition-transform ${
                accent === color
                  ? 'scale-110 border-gray-900 dark:border-gray-100'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`${t('settingsTab.accent')} ${color}`}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleRefreshMemory}
        className="w-full rounded-lg border border-current px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent/10"
        style={{ color: 'var(--accent)' }}
      >
        {t('settingsTab.addTutorial')}
      </button>

      <div className="h-px bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-3">
        <div className="px-0.5 py-0.5">
          {userEmail ? (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">{userEmail}</p>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                <FiLogOut size={14} />
                <span>{t('sync.signOut')}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <FiLogIn size={15} />
              <span>{t('sync.signIn')}</span>
            </button>
          )}
        </div>

        <a
          href="https://t.me/IncludeIntelligence"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-current px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent/10"
          style={{ color: 'var(--accent)' }}
        >
          <FaTelegramPlane size={14} />
          <span>{t('tooltip.telegram')}</span>
        </a>
        <a
          href="https://github.com/ovepfunkep/NewLifeRoadmap"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-current px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent/10"
          style={{ color: 'var(--accent)' }}
        >
          <FiGithub size={14} />
          <span>{t('tooltip.github')}</span>
        </a>
      </div>

      {showSecurityModal && (
        <SecurityChoiceModal onChoice={handleSecurityChoice} />
      )}
    </section>
  );
}
