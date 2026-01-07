import { getCurrentUser } from './auth';
import { getFirebaseDB } from './config';
import { doc, setDoc, getDoc } from 'firebase/firestore';

function log() {
  // Debug logging disabled
}

export interface UserSettings {
  theme?: 'light' | 'dark';
  accent?: string;
  language?: 'ru' | 'en';
  effectsEnabled?: boolean;
}

// Debounce для сохранения настроек
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DELAY = 2000; // 2 секунды задержка

/**
 * Сохранить настройки пользователя в Firestore с дебаунсом
 */
export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  // Очищаем предыдущий таймер
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Устанавливаем новый таймер
  saveTimeout = setTimeout(async () => {
    const db = getFirebaseDB();
    try {
      log('Saving user settings (debounced):', settings);
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'data');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      log('User settings saved successfully');
    } catch (error) {
      log('Error saving user settings:', error);
    }
    saveTimeout = null;
  }, SAVE_DELAY);
}

/**
 * Сохранить все настройки пользователя сразу (для использования перед перезагрузкой страницы)
 */
export async function saveAllUserSettings(settings: UserSettings): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, skipping settings save');
    return;
  }

  const db = getFirebaseDB();

  try {
    log('Saving all user settings:', settings);
    const settingsRef = doc(db, 'users', user.uid, 'settings', 'data');
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    log('All user settings saved successfully');
  } catch (error) {
    log('Error saving all user settings:', error);
    console.error('Error saving all user settings to Firestore:', error);
    throw error;
  }
}

/**
 * Загрузить настройки пользователя из Firestore
 */
export async function loadUserSettings(): Promise<UserSettings | null> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, cannot load settings');
    return null;
  }

  const db = getFirebaseDB();
  if (!db) {
    log('Firebase DB not initialized');
    return null;
  }

  try {
    log('Loading user settings from Firestore');
    // Используем collection и doc правильно для четного количества сегментов
    const settingsRef = doc(db, 'users', user.uid, 'settings', 'data');
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      log('User settings loaded:', data);
      return data as UserSettings;
    } else {
      log('No user settings found in Firestore');
      return null;
    }
  } catch (error) {
    log('Error loading user settings:', error);
    console.error('Error loading user settings from Firestore:', error);
    return null;
  }
}

