import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  User,
  onAuthStateChanged,
  Auth
} from 'firebase/auth';
import { initFirebase } from './config';

// Инициализируем Firebase при импорте
let auth: Auth | null = null;
try {
  const fb = initFirebase();
  auth = fb.auth;
} catch (error) {
  console.warn('Firebase not initialized:', error);
}

/**
 * Вход через Google
 */
export async function signInWithGoogle(withDrive: boolean = false): Promise<User> {
  if (!auth) {
    const fb = initFirebase();
    auth = fb.auth;
  }
  
  const provider = new GoogleAuthProvider();
  if (withDrive) {
    provider.addScope('https://www.googleapis.com/auth/drive.appdata');
  }
  
  const result = await signInWithPopup(auth!, provider);
  
  // Сохраняем access token для работы с Google API (если нужно)
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    localStorage.setItem('google_access_token', credential.accessToken);
  }
  
  return result.user;
}

/**
 * Выход из аккаунта
 */
export async function signOutUser(): Promise<void> {
  if (!auth) {
    const fb = initFirebase();
    auth = fb.auth;
  }
  
  localStorage.removeItem('google_access_token');
  await signOut(auth!);
}

/**
 * Получить текущего пользователя
 */
export function getCurrentUser(): User | null {
  if (!auth) {
    const fb = initFirebase();
    auth = fb.auth;
  }
  
  return auth!.currentUser;
}

/**
 * Подписаться на изменения состояния авторизации
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    const fb = initFirebase();
    auth = fb.auth;
  }
  
  return onAuthStateChanged(auth!, callback);
}

/**
 * Проверить, авторизован ли пользователь
 */
export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}


