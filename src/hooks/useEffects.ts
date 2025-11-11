import { useState, useEffect } from 'react';

const EFFECTS_KEY = 'effectsEnabled';

export function useEffects() {
  const [effectsEnabled, setEffectsEnabledState] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(EFFECTS_KEY);
      return stored !== 'false'; // По умолчанию включено
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem(EFFECTS_KEY, String(effectsEnabled));
    
    // Синхронизируем с облаком в фоне
    (async () => {
      try {
        const { saveUserSettings } = await import('../firebase/settingsSync');
        await saveUserSettings({ effectsEnabled });
      } catch (error) {
        // Игнорируем ошибки синхронизации настроек
      }
    })();
  }, [effectsEnabled]);

  const setEffectsEnabled = (enabled: boolean) => {
    setEffectsEnabledState(enabled);
  };

  return { effectsEnabled, setEffectsEnabled };
}


