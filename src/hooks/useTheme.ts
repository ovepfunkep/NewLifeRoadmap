import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return stored || 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
    
    // Синхронизируем с облаком в фоне
    (async () => {
      try {
        const { saveUserSettings } = await import('../firebase/settingsSync');
        await saveUserSettings({ theme });
      } catch (error) {
        // Игнорируем ошибки синхронизации настроек
      }
    })();
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return { theme, setTheme };
}
