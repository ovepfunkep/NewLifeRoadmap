import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

let appCheckInitialized = false;

/** App Check снижает автоматизированный трафик; без site key в проде не включаем (см. docs/RUNBOOK.md). */
function tryInitAppCheck(app: FirebaseApp): void {
  if (appCheckInitialized) return;

  const siteKey = (import.meta.env.VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY as string | undefined)?.trim();
  const debugRaw = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN as string | undefined;

  if (import.meta.env.DEV && debugRaw) {
    const g = globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string };
    g.FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugRaw === '1' || debugRaw === 'true' ? true : debugRaw;
  }

  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.info(
        '[Firebase] App Check off: set VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY (reCAPTCHA v3 key from Firebase App Check).'
      );
    }
    return;
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (e) {
    console.warn('[Firebase] App Check init failed:', e);
  }
}

// Конфигурация Firebase из переменных окружения
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Проверка наличия конфигурации
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.warn('Firebase config is missing. Please set environment variables.');
}

// Инициализация Firebase
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app) {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error('Firebase configuration is missing. Please check your .env file.');
    }
    app = initializeApp(firebaseConfig);
    tryInitAppCheck(app);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { app, auth: auth!, db: db! };
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}

export function getFirebaseDB(): Firestore {
  if (!db) {
    const fb = initFirebase();
    return fb.db;
  }
  return db;
}

