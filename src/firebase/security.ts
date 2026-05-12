import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { initFirebase } from './config';
import { reportCloudFirestoreFailure, reportCloudFirestoreSuccess } from '../utils/cloudFirestoreHealth';

/**
 * Работа с ключами безопасности в Firestore
 */

const SECURITY_COLLECTION = 'security';
const CONFIG_DOC = 'config';

export async function getSyncKeyFromFirestore(userId: string): Promise<string | null> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  try {
    const docSnap = await getDoc(docRef);
    reportCloudFirestoreSuccess();
    if (docSnap.exists()) {
      return docSnap.data().syncKey || null;
    }
    return null;
  } catch (e) {
    reportCloudFirestoreFailure(e);
    return null;
  }
}

export async function saveSyncKeyToFirestore(userId: string, syncKey: string): Promise<void> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  try {
    await setDoc(docRef, { 
      syncKey,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    reportCloudFirestoreSuccess();
  } catch (e) {
    reportCloudFirestoreFailure(e);
    throw e;
  }
}

export async function deleteSyncKeyFromFirestore(userId: string): Promise<void> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  try {
    await updateDoc(docRef, {
      syncKey: deleteField()
    });
    reportCloudFirestoreSuccess();
  } catch (e) {
    reportCloudFirestoreFailure(e);
    throw e;
  }
}

export async function getUserSecurityConfig(userId: string): Promise<any | null> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  try {
    const docSnap = await getDoc(docRef);
    reportCloudFirestoreSuccess();
    return docSnap.exists() ? docSnap.data() : null;
  } catch (e) {
    reportCloudFirestoreFailure(e);
    return null;
  }
}

export async function saveUserSecurityConfig(userId: string, config: any): Promise<void> {
  const { db } = initFirebase();
  const docRef = doc(db, 'users', userId, SECURITY_COLLECTION, CONFIG_DOC);
  try {
    await setDoc(docRef, {
      ...config,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    reportCloudFirestoreSuccess();
  } catch (e) {
    reportCloudFirestoreFailure(e);
    throw e;
  }
}

