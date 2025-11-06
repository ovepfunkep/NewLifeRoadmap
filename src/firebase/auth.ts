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

// Провайдер для Google Sign-In
const googleProvider = new GoogleAuthProvider();

/**
 * Вход через Google
 */
export async function signInWithGoogle(): Promise<User> {
  if (!auth) {
    const fb = initFirebase();
    auth = fb.auth;
  }
  
  const result = await signInWithPopup(auth!, googleProvider);
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


