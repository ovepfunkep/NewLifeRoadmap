import { getCurrentUser } from './auth';
import { getFirebaseDB } from './config';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  if (isDev) {
    console.log(`[SettingsSync] ${message}`, ...args);
  }
}

export interface UserSettings {
  theme?: 'light' | 'dark';
  accent?: string;
  language?: 'ru' | 'en';
  effectsEnabled?: boolean;
}

/**
 * Сохранить настройки пользователя в Firestore
 * Использует merge: true, чтобы не перезаписывать другие поля
 */
export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    log('User not authenticated, skipping settings save');
    return;
  }

  const db = getFirebaseDB();

  try {
    log('Saving user settings:', settings);
    // Используем collection и doc правильно для четного количества сегментов
    const settingsRef = doc(db, 'users', user.uid, 'settings', 'data');
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: new Date().toISOString(),
    }, { merge: true }); // Используем merge, чтобы не перезаписывать другие поля
    log('User settings saved successfully');
  } catch (error) {
    log('Error saving user settings:', error);
    console.error('Error saving user settings to Firestore:', error);
    throw error;
  }
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

