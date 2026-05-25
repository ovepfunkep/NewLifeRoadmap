import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { FiSave, FiRotateCcw, FiHelpCircle } from 'react-icons/fi';
import { useTranslation } from '../i18n';
import { useToast } from '../hooks/useToast';
import { getCurrentUser } from '../firebase/auth';
import { Tooltip } from './Tooltip';
import {
  getWeeklyBackupSettingsSubscribe,
  setWeeklyLocalBackupEnabledLocal,
  hasWeeklyBackupReady,
  tryCreateWeeklyBackupIfDue,
  restoreWeeklyBackupFromStorage,
  shouldRunWeeklyBackupNow,
  readWeeklyBackupRaw,
  parseWeeklyBackupFile,
  runWeeklyBackupNow,
  type WeeklyBackupFileV1,
} from '../utils/weeklyLocalBackup';
import { WeeklyBackupRestoreDialog } from './WeeklyBackupRestoreDialog';

interface WeeklyLocalBackupSettingsBlockProps {
  /** Узкая полоска в подвале на десктопе; на мобиле — карточка столбцом. */
  variant?: 'footerBar' | 'stacked';
  /** Без своей серой оболочки — внутри общей плиты настроек (мобилка). */
  embedded?: boolean;
}

/** Тумблер автобэкапа, ручной снимок, восстановление; тост бэкапа = один (loading → success). */
export function WeeklyLocalBackupSettingsBlock({
  variant = 'stacked',
  embedded = false,
}: WeeklyLocalBackupSettingsBlockProps) {
  const t = useTranslation();
  const { showToast, updateToast, removeToast } = useToast();
  const store = useMemo(() => getWeeklyBackupSettingsSubscribe(), []);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const enabled = snap.split('|')[0] === 'true';
  const lastAtIso = snap.split('|')[1] || null;

  const [canRestore, setCanRestore] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreBackup, setRestoreBackup] = useState<WeeklyBackupFileV1 | null>(null);
  const [restoring, setRestoring] = useState(false);

  const isBar = variant === 'footerBar';
  const stackedEmbedded = !isBar && embedded;

  const refreshRestore = useCallback(() => {
    void hasWeeklyBackupReady().then(setCanRestore);
  }, []);

  useEffect(() => {
    refreshRestore();
  }, [snap, refreshRestore]);

  const formattedLastAt = useMemo(() => {
    if (!lastAtIso) return '';
    const d = new Date(lastAtIso);
    if (!Number.isFinite(d.getTime())) return lastAtIso;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }, [lastAtIso]);

  const runBackupWithSingleToast = useCallback(async () => {
    const id = showToast(t('settingsTab.weeklyBackupProgressToast'), undefined, {
      isLoading: true,
      persistent: true,
      type: 'default',
    });
    try {
      const r = await runWeeklyBackupNow();
      if (r === 'ok') {
        updateToast(id, {
          message: t('settingsTab.weeklyBackupDoneToast'),
          isLoading: false,
          isSuccess: true,
          persistent: false,
          type: 'success',
        });
        refreshRestore();
      } else {
        removeToast(id);
        showToast(t('settingsTab.weeklyBackupErrorToast'), undefined, { type: 'error' });
      }
    } catch {
      removeToast(id);
      showToast(t('settingsTab.weeklyBackupErrorToast'), undefined, { type: 'error' });
    }
  }, [showToast, updateToast, removeToast, t, refreshRestore]);

  const handleToggle = async () => {
    const next = !enabled;
    setWeeklyLocalBackupEnabledLocal(next);
    try {
      const user = getCurrentUser();
      if (user) {
        const { saveUserSettings } = await import('../firebase/settingsSync');
        await saveUserSettings({ weeklyLocalBackupEnabled: next });
      }
    } catch {
      // ignore cloud errors
    }

    if (next && shouldRunWeeklyBackupNow()) {
      const id = showToast(t('settingsTab.weeklyBackupProgressToast'), undefined, {
        isLoading: true,
        persistent: true,
        type: 'default',
      });
      try {
        const r = await tryCreateWeeklyBackupIfDue();
        if (r === 'ok') {
          updateToast(id, {
            message: t('settingsTab.weeklyBackupDoneToast'),
            isLoading: false,
            isSuccess: true,
            persistent: false,
            type: 'success',
          });
          refreshRestore();
        } else if (r === 'failed') {
          removeToast(id);
          showToast(t('settingsTab.weeklyBackupErrorToast'), undefined, { type: 'error' });
        } else {
          removeToast(id);
        }
      } catch {
        removeToast(id);
        showToast(t('settingsTab.weeklyBackupErrorToast'), undefined, { type: 'error' });
      }
    }
  };

  const openRestoreModal = async () => {
    if (!canRestore || restoring || restoreOpen) return;
    const raw = await readWeeklyBackupRaw();
    const file = raw ? parseWeeklyBackupFile(raw) : null;
    if (!file) {
      showToast(t('settingsTab.weeklyBackupRestoreErrorToast'), undefined, { type: 'error' });
      return;
    }
    setRestoreBackup(file);
    setRestoreOpen(true);
  };

  const handleConfirmRestore = async () => {
    setRestoring(true);
    try {
      await restoreWeeklyBackupFromStorage();
      setRestoreOpen(false);
      setRestoreBackup(null);
      showToast(t('settingsTab.weeklyBackupRestoreDoneToast'), undefined, { type: 'success' });
      window.dispatchEvent(new CustomEvent('syncManager:dataUpdated'));
      refreshRestore();
    } catch {
      showToast(t('settingsTab.weeklyBackupRestoreErrorToast'), undefined, { type: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  const shellClass = isBar
    ? 'inline-flex max-w-full items-center rounded-2xl bg-gray-100/95 px-2.5 py-1.5 dark:bg-gray-800/90'
    : stackedEmbedded
      ? 'space-y-3'
      : 'space-y-3 rounded-lg bg-gray-100 px-3 py-3 dark:bg-gray-700';

  const restoreTooltip = useMemo(() => {
    if (!canRestore) return t('settingsTab.weeklyBackupRestoreTooltipDisabled');
    return `${t('settingsTab.weeklyBackupRestoreTooltip')}${formattedLastAt ? `\n${t('settingsTab.weeklyBackupLastAtPrefix')}${formattedLastAt}` : ''}`;
  }, [canRestore, formattedLastAt, t]);

  return (
    <>
      <div className={shellClass} onClick={(e) => e.stopPropagation()}>
        {isBar ? (
          <div className="flex max-w-full flex-nowrap items-center gap-2">
            <div className="flex min-w-0 shrink items-center gap-0.5">
              <span className="truncate text-[11px] font-semibold tracking-tight text-gray-600 dark:text-gray-300">
                {t('settingsTab.weeklyBackupShortLabel')}
              </span>
              <Tooltip text={t('settingsTab.weeklyBackupHelpTooltip')} multiline position="top">
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-black/[0.04] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-accent"
                  aria-label={t('settingsTab.weeklyBackupHelpAria')}
                >
                  <FiHelpCircle size={14} strokeWidth={2} aria-hidden />
                </button>
              </Tooltip>
            </div>
            <span className="h-4 w-px shrink-0 bg-gray-300/90 dark:bg-gray-600" aria-hidden />
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={t('settingsTab.weeklyBackupToggleAria')}
              onClick={() => void handleToggle()}
              className={`relative h-5 w-9 shrink-0 self-center rounded-full transition-colors ${
                enabled ? '' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              style={enabled ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="h-4 w-px shrink-0 bg-gray-300/90 dark:bg-gray-600" aria-hidden />
            <div className="flex shrink-0 items-center gap-0 rounded-lg bg-white/65 p-0.5 dark:bg-gray-900/45">
              <Tooltip text={t('settingsTab.weeklyBackupSaveTooltip')} position="top">
                <button
                  type="button"
                  onClick={() => void runBackupWithSingleToast()}
                  className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-accent/12 hover:text-accent dark:text-gray-300 dark:hover:text-accent"
                  aria-label={t('settingsTab.weeklyBackupSaveTooltip')}
                >
                  <FiSave size={17} strokeWidth={2} aria-hidden />
                </button>
              </Tooltip>
              <Tooltip text={restoreTooltip} multiline position="top">
                <span className="inline-flex">
                  <button
                    type="button"
                    disabled={!canRestore || restoring || restoreOpen}
                    onClick={() => void openRestoreModal()}
                    className={`rounded-md p-1.5 transition-colors ${
                      canRestore && !restoring && !restoreOpen
                        ? 'text-gray-600 hover:bg-accent/12 hover:text-accent dark:text-gray-300 dark:hover:text-accent'
                        : 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                    }`}
                    aria-label={t('settingsTab.weeklyBackupRestore')}
                  >
                    <FiRotateCcw size={17} strokeWidth={2} aria-hidden />
                  </button>
                </span>
              </Tooltip>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <p className="min-w-0 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {t('settingsTab.weeklyBackupToggle')}
                </p>
                <Tooltip text={t('settingsTab.weeklyBackupHelpTooltip')} multiline position="top">
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent dark:text-gray-500 dark:hover:text-accent"
                    aria-label={t('settingsTab.weeklyBackupHelpAria')}
                  >
                    <FiHelpCircle size={16} strokeWidth={2} aria-hidden />
                  </button>
                </Tooltip>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t('settingsTab.weeklyBackupToggleAria')}
                onClick={() => void handleToggle()}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  enabled ? '' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                style={enabled ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void runBackupWithSingleToast()}
              className="w-full rounded-xl bg-white/70 py-2.5 text-sm font-semibold text-gray-800 transition-opacity active:opacity-90 dark:bg-gray-900/45 dark:text-gray-100"
            >
              {t('settingsTab.weeklyBackupBackupNow')}
            </button>
            <div className="space-y-1">
              <button
                type="button"
                disabled={!canRestore || restoring || restoreOpen}
                onClick={() => void openRestoreModal()}
                className={`w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-opacity active:opacity-90 ${
                  canRestore && !restoring && !restoreOpen
                    ? 'text-white'
                    : 'cursor-not-allowed bg-gray-300/90 text-gray-500 dark:bg-gray-600/90 dark:text-gray-400'
                }`}
                style={canRestore && !restoring && !restoreOpen ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                {t('settingsTab.weeklyBackupRestore')}
              </button>
              {canRestore && lastAtIso ? (
                <p className="text-center text-xs text-gray-600 dark:text-gray-400">
                  {t('settingsTab.weeklyBackupLastAtPrefix')}
                  {formattedLastAt}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {restoreOpen && restoreBackup ? (
        <WeeklyBackupRestoreDialog
          open={restoreOpen}
          backup={restoreBackup}
          isWorking={restoring}
          onClose={() => {
            if (!restoring) {
              setRestoreOpen(false);
              setRestoreBackup(null);
            }
          }}
          onConfirmRestore={() => void handleConfirmRestore()}
          title={t('settingsTab.weeklyBackupRestoreModalTitle')}
          intro={t('settingsTab.weeklyBackupRestoreModalIntro')}
          previewTitle={t('settingsTab.weeklyBackupRestoreModalPreview')}
          cancelLabel={t('general.cancel')}
          confirmLabel={t('settingsTab.weeklyBackupRestoreConfirmAction')}
        />
      ) : null}
    </>
  );
}
