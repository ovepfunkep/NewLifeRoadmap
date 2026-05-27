import { APP_BUILD_VERSION } from '../generated/appVersion';
import { useTranslation } from '../i18n';

/** Копирайт и номер сборки (число коммитов в git на момент build). */
export function CopyrightNotice({ className = '' }: { className?: string }) {
  const t = useTranslation();
  const year = new Date().getFullYear();
  const versionLabel = `${t('footer.version')} ${APP_BUILD_VERSION}`;

  return (
    <div className={className}>
      <p className="text-[10px] text-gray-500 dark:text-gray-400">
        © {year} Тябин Иван Алексеевич
      </p>
      <p className="text-[9px] tabular-nums text-gray-400 dark:text-gray-500" aria-label={versionLabel}>
        {versionLabel}
      </p>
    </div>
  );
}
