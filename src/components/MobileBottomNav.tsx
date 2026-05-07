import { FiBarChart2, FiCheckSquare, FiClock, FiSettings } from 'react-icons/fi';
import { Z_MOBILE_NAV } from '../config/zLayers';
import { t } from '../i18n';

export type MobileSection = 'tasks' | 'deadlines' | 'dashboard' | 'settings';

interface MobileBottomNavProps {
  activeSection: MobileSection;
  onSectionChange: (section: MobileSection) => void;
}

const NAV_ITEMS: Array<{ id: MobileSection; icon: React.ElementType; labelKey: string }> = [
  { id: 'tasks', icon: FiCheckSquare, labelKey: 'mobileNav.tasks' },
  { id: 'deadlines', icon: FiClock, labelKey: 'mobileNav.deadlines' },
  { id: 'dashboard', icon: FiBarChart2, labelKey: 'mobileNav.dashboard' },
  { id: 'settings', icon: FiSettings, labelKey: 'mobileNav.settings' },
];

export function MobileBottomNav({ activeSection, onSectionChange }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/95"
      style={{ zIndex: Z_MOBILE_NAV }}
    >
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'bg-accent/10'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
              style={{ color: isActive ? 'var(--accent)' : undefined }}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
