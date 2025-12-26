import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface SettingsContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accent: string;
  setAccent: (accent: string) => void;
  effectsEnabled: boolean;
  setEffectsEnabled: (enabled: boolean) => void;
  colors: string[];
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const ACCENT_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#ea580c', // orange
  '#9333ea', // purple
  '#ec4899', // pink
  '#0891b2', // cyan
  '#ca8a04', // yellow
];

const DEFAULT_ACCENT = ACCENT_COLORS[0];
const EFFECTS_KEY = 'effectsEnabled';

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Theme state
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme') as Theme | null;
      return stored || 'light';
    }
    return 'light';
  });

  // Accent state
  const [accent, setAccentState] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('accent');
      return stored || DEFAULT_ACCENT;
    }
    return DEFAULT_ACCENT;
  });

  // Effects state
  const [effectsEnabled, setEffectsEnabledState] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(EFFECTS_KEY);
      return stored !== 'false';
    }
    return true;
  });

  // Apply theme and accent to DOM
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    localStorage.setItem('accent', accent);
  }, [accent]);

  useEffect(() => {
    localStorage.setItem(EFFECTS_KEY, String(effectsEnabled));
  }, [effectsEnabled]);

  // Sync with cloud (debounced via saveUserSettings)
  const syncWithCloud = useCallback(async (settings: any) => {
    // Не сохраняем, если это обновление пришло из самого облака
    if ((window as any).__isApplyingCloudSettings) return;

    try {
      const { getCurrentUser } = await import('../firebase/auth');
      if (getCurrentUser()) {
        const { saveUserSettings } = await import('../firebase/settingsSync');
        await saveUserSettings(settings);
      }
    } catch (error) {
      // Ignore sync errors
    }
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    syncWithCloud({ theme: newTheme });
  }, [syncWithCloud]);

  const setAccent = useCallback((newAccent: string) => {
    setAccentState(newAccent);
    syncWithCloud({ accent: newAccent });
  }, [syncWithCloud]);

  const setEffectsEnabled = useCallback((enabled: boolean) => {
    setEffectsEnabledState(enabled);
    syncWithCloud({ effectsEnabled: enabled });
  }, [syncWithCloud]);

  return (
    <SettingsContext.Provider value={{ 
      theme, setTheme, 
      accent, setAccent, 
      effectsEnabled, setEffectsEnabled,
      colors: ACCENT_COLORS 
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

