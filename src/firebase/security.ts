import { doc, getDoc, setDoc } from 'firebase/firestore';
import { initFirebase } from './config';
import { getCurrentUser } from './auth';

/**
 * Работа с ключами безопасности в Firestore
 */

const SECURITY_COLLECTION = 'security';
const CONFIG_DOC = 'config';

export async function getSyncKeyFromFirestore(userId: string): Promise<string | null> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().syncKey || null;
  }
  return null;
}

export async function saveSyncKeyToFirestore(userId: string, syncKey: string): Promise<void> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  await setDoc(docRef, { 
    syncKey,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function getUserSecurityConfig(userId: string): Promise<any | null> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  const docSnap = await getDoc(docRef);

  return docSnap.exists() ? docSnap.data() : null;
}

export async function saveUserSecurityConfig(userId: string, config: any): Promise<void> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  await setDoc(docRef, {
    ...config,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

