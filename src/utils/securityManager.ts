import { generateEncryptionKey } from './crypto';
import { 
  getSyncKeyFromFirestore, 
  saveSyncKeyToFirestore, 
  deleteSyncKeyFromFirestore,
  getUserSecurityConfig, 
  saveUserSecurityConfig 
} from '../firebase/security';
import { getSyncKeyFromGoogleDrive, saveSyncKeyToGoogleDrive } from './googleDrive';

export type EncryptionMode = 'gdrive' | 'firestore' | 'none';

export interface SecurityConfig {
  mode: EncryptionMode;
  initialized: boolean;
}

let currentSyncKey: string | null = null;
let currentMode: EncryptionMode = 'none';

/**
 * Инициализация системы безопасности
 */
export async function initSecurity(userId: string): Promise<{ mode: EncryptionMode, initialized: boolean }> {
  // Проверяем локальный кэш сначала
  const cachedKey = localStorage.getItem(`sync_key_${userId}`);
  const cachedMode = localStorage.getItem(`security_mode_${userId}`) as EncryptionMode;

  if (cachedKey && cachedMode) {
    currentSyncKey = cachedKey;
    currentMode = cachedMode;
    return { mode: currentMode, initialized: true };
  }

  // Если нет в кэше, проверяем конфиг в Firestore
  const config = await getUserSecurityConfig(userId);
  if (config && config.initialized) {
    currentMode = config.mode;
    
    // Пытаемся получить ключ из соответствующего хранилища
    let key: string | null = null;
    if (currentMode === 'gdrive') {
      key = await getSyncKeyFromGoogleDrive();
    } else if (currentMode === 'firestore') {
      key = await getSyncKeyFromFirestore(userId);
    }

    if (key) {
      currentSyncKey = key;
      localStorage.setItem(`sync_key_${userId}`, key);
      localStorage.setItem(`security_mode_${userId}`, currentMode);
      return { mode: currentMode, initialized: true };
    }
  }

  return { mode: 'none', initialized: false };
}

/**
 * Установка выбранного режима безопасности
 */
export async function setupSecurity(mode: EncryptionMode, userId: string): Promise<string> {
  // 1. Пытаемся найти существующий ключ в обоих хранилищах, чтобы не потерять доступ к данным
  let existingKey = currentSyncKey;

  if (!existingKey) {
    // Проверяем Google Drive (могли только что получить права)
    existingKey = await getSyncKeyFromGoogleDrive();
  }
  
  if (!existingKey) {
    // Проверяем Firestore
    existingKey = await getSyncKeyFromFirestore(userId);
  }

  // 2. Если ключа нет нигде - генерируем новый. Если есть - используем старый!
  const finalKey = existingKey || await generateEncryptionKey();
  
  // 3. Сохраняем ключ в выбранное пользователем место
  if (mode === 'gdrive') {
    await saveSyncKeyToGoogleDrive(finalKey);
    // Удаляем из Firestore, если он там был (переход на усиленную защиту)
    try {
      await deleteSyncKeyFromFirestore(userId);
    } catch (e) {
      // Игнорируем, если поля не было
    }
  } else if (mode === 'firestore') {
    await saveSyncKeyToFirestore(userId, finalKey);
  }

  // 4. Обновляем конфиг в Firestore
  await saveUserSecurityConfig(userId, { mode, initialized: true });
  
  currentSyncKey = finalKey;
  currentMode = mode;
  
  localStorage.setItem(`sync_key_${userId}`, finalKey);
  localStorage.setItem(`security_mode_${userId}`, mode);

  // Уведомляем систему, что безопасность настроена
  window.dispatchEvent(new CustomEvent('security:initialized', { detail: { userId, mode } }));
  
  return finalKey;
}

/**
 * Получить текущий ключ шифрования
 */
export function getActiveSyncKey(): string | null {
  return currentSyncKey;
}

/**
 * Получить текущий режим
 */
export function getActiveSecurityMode(): EncryptionMode {
  return currentMode;
}

/**
 * Сброс состояния (при выходе)
 */
export function resetSecurity() {
  currentSyncKey = null;
  currentMode = 'none';
}

