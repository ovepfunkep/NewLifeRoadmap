import { useEffect, useRef } from 'react';
import { onAuthChange, getCurrentUser } from '../firebase/auth';
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
  const loadedUserIdRef = useRef<string | null>(null);
  const isInitialMountRef = useRef(true);

  // Функция для загрузки и применения настроек из облака
  const loadAndApplySettings = async (forceReload: boolean = false) => {
    const user = getCurrentUser();
    if (!user) {
      log('User not authenticated, skipping settings load');
      loadedUserIdRef.current = null; // Сбрасываем при выходе
      return;
    }

    // Если настройки уже загружены для этого пользователя и не требуется принудительная перезагрузка, пропускаем
    if (!forceReload && loadedUserIdRef.current === user.uid) {
      log('Settings already loaded for user:', user.uid);
      return;
    }

    log('Loading settings from cloud for user:', user.uid, forceReload ? '(forced reload)' : '');
    try {
      const cloudSettings = await loadUserSettings();
      if (cloudSettings) {
        log('Cloud settings loaded:', cloudSettings);
        
        // Проверяем, отличаются ли настройки от локальных
        const hasChanges = 
          (cloudSettings.theme && cloudSettings.theme !== theme) ||
          (cloudSettings.accent && cloudSettings.accent !== accent) ||
          (cloudSettings.language && cloudSettings.language !== language) ||
          (cloudSettings.effectsEnabled !== undefined && cloudSettings.effectsEnabled !== effectsEnabled);
        
        if (hasChanges) {
          log('Settings differ from local, applying and reloading');
          loadedUserIdRef.current = user.uid; // Помечаем, что настройки загружены для этого пользователя
          
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
          
          // Перезагружаем страницу после применения настроек
          // Помечаем, что перезагрузка программная, чтобы не показывать предупреждение
          (window as any).__isProgrammaticReload = true;
          setTimeout(() => {
            log('Reloading page after applying cloud settings');
            window.location.reload();
          }, 100); // Небольшая задержка, чтобы настройки успели сохраниться в localStorage
        } else {
          log('Settings match local, no reload needed');
          loadedUserIdRef.current = user.uid; // Помечаем как загруженные, чтобы не пытаться снова
        }
      } else {
        log('No cloud settings found, using local settings');
        loadedUserIdRef.current = user.uid; // Помечаем как загруженные, чтобы не пытаться снова
      }
    } catch (error) {
      log('Error loading settings from cloud:', error);
      console.error('Error loading settings from cloud:', error);
      loadedUserIdRef.current = user.uid; // Помечаем как загруженные даже при ошибке, чтобы не зациклиться
    }
  };

  useEffect(() => {
    log('Initializing settings sync manager');
    
    // Проверяем текущего пользователя сразу при монтировании
    loadAndApplySettings(false);
    isInitialMountRef.current = false;
    
    // Также подписываемся на изменения авторизации
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        log('User signed in:', user.uid);
        // При входе пользователя всегда загружаем настройки заново, чтобы перезаписать локальные
        // Это важно, если пользователь выходил из аккаунта и менял настройки локально
        await loadAndApplySettings(true); // Принудительная перезагрузка при входе
      } else {
        log('User signed out');
        loadedUserIdRef.current = null; // Сбрасываем флаг при выходе
      }
    });

    return () => {
      log('Cleaning up settings sync manager');
      unsubscribe();
    };
  }, []); // Пустой массив зависимостей, чтобы запускалось только при монтировании

  return null;
}

