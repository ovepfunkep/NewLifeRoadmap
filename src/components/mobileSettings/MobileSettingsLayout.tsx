import type { ReactNode } from 'react';

/** Заголовок секции над «плитой» настроек. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Одна сгруппированная плита с разделителями между строками. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-gray-200/80 overflow-hidden rounded-2xl bg-gray-100 dark:divide-gray-600/80 dark:bg-gray-800/90">
      {children}
    </div>
  );
}

/** Стандартная строка: слева подпись/контент, справа контрол. */
export function SettingsRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-h-[48px] items-center justify-between gap-3 px-4 py-3 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
