import { useEffect } from 'react';
import { onAuthChange } from '../firebase/auth';
import { loadUserSettings } from '../firebase/settingsSync';
import { useTheme } from '../hooks/useTheme';
import { useAccent } from '../hooks/useAccent';
import { useEffects } from '../hooks/useEffects';
import { useLanguage } from '../contexts/LanguageContext';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  if (isDev) {
    console.log(`[SettingsSyncManager] ${message}`, ...args);
  }
}

export function SettingsSyncManager() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { effectsEnabled, setEffectsEnabled } = useEffects();
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    log('Initializing settings sync manager');
    
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        log('User signed in, loading settings from cloud');
        try {
          const cloudSettings = await loadUserSettings();
          if (cloudSettings) {
            log('Cloud settings loaded:', cloudSettings);
            
            // Применяем настройки из облака
            if (cloudSettings.theme && cloudSettings.theme !== theme) {
              log('Applying theme from cloud:', cloudSettings.theme);
              setTheme(cloudSettings.theme);
            }
            
            if (cloudSettings.accent && cloudSettings.accent !== accent) {
              log('Applying accent from cloud:', cloudSettings.accent);
              setAccent(cloudSettings.accent);
            }
            
            if (cloudSettings.language && cloudSettings.language !== language) {
              log('Applying language from cloud:', cloudSettings.language);
              setLanguage(cloudSettings.language);
            }
            
            if (cloudSettings.effectsEnabled !== undefined && cloudSettings.effectsEnabled !== effectsEnabled) {
              log('Applying effectsEnabled from cloud:', cloudSettings.effectsEnabled);
              setEffectsEnabled(cloudSettings.effectsEnabled);
            }
          } else {
            log('No cloud settings found, using local settings');
          }
        } catch (error) {
          log('Error loading settings from cloud:', error);
          console.error('Error loading settings from cloud:', error);
        }
      } else {
        log('User signed out');
      }
    });

    return () => {
      log('Cleaning up settings sync manager');
      unsubscribe();
    };
  }, []); // Пустой массив зависимостей, чтобы запускалось только при монтировании

  return null;
}

