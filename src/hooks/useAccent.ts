import { useState, useEffect } from 'react';

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

export function useAccent() {
  const [accent, setAccentState] = useState(() => {
    const stored = localStorage.getItem('accent');
    return stored || DEFAULT_ACCENT;
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    localStorage.setItem('accent', accent);
    
    // Синхронизируем с облаком в фоне
    (async () => {
      try {
        const { saveUserSettings } = await import('../firebase/settingsSync');
        await saveUserSettings({ accent });
      } catch (error) {
        // Игнорируем ошибки синхронизации настроек
      }
    })();
  }, [accent]);

  const setAccent = (color: string) => {
    setAccentState(color);
  };

  return { accent, setAccent, colors: ACCENT_COLORS };
}

