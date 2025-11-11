import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getLanguage, setLanguage as setI18nLanguage, Language } from '../i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return getLanguage();
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setI18nLanguage(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', lang);
      
      // Синхронизируем с облаком в фоне
      (async () => {
        try {
          const { saveUserSettings } = await import('../firebase/settingsSync');
          await saveUserSettings({ language: lang });
        } catch (error) {
          // Игнорируем ошибки синхронизации настроек
        }
      })();
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
