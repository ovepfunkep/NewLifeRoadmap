import type { Node } from './types';

// Debounce для синхронизации
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DELAY = 500; // 500ms задержка

// Проверка авторизации перед синхронизацией
async function isUserAuthenticated(): Promise<boolean> {
  try {
    const { getCurrentUser } = await import('./firebase/auth');
    return getCurrentUser() !== null;
  } catch {
    return false;
  }
}

// Динамический импорт для избежания циклических зависимостей
async function syncNodeToFirestore(node: Node): Promise<void> {
  const { syncNodeToFirestore: syncFn } = await import('./firebase/sync');
  return syncFn(node);
}

// Проверка готовности системы безопасности
async function isSecurityReady(): Promise<boolean> {
  try {
    const { getActiveSyncKey } = await import('./utils/securityManager');
    return getActiveSyncKey() !== null;
  } catch {
    return false;
  }
}

/**
 * Синхронизировать узел с Firestore (с debounce)
 */
async function syncNodeDebounced(node: Node): Promise<void> {
  // Проверяем авторизацию перед синхронизацией
  if (!(await isUserAuthenticated())) {
    return; // Пользователь не залогинен, пропускаем синхронизацию
  }

  // Если пользователь залогинен, но ключ еще не готов - ждем или пропускаем
  // Это предотвращает отправку незашифрованных данных при первом входе
  if (!(await isSecurityReady())) {
    console.warn('[Sync] Security not ready, skipping debounced sync');
    return;
  }

  // Очищаем предыдущий таймер
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Устанавливаем новый таймер
  syncTimeout = setTimeout(async () => {
    try {
      // Повторно проверяем авторизацию перед выполнением синхронизации
      if (await isUserAuthenticated()) {
        await syncNodeToFirestore(node);
      }
    } catch (error) {
      console.error('Background sync error:', error);
      // Не показываем ошибку пользователю для фоновой синхронизации
    }
    syncTimeout = null;
  }, SYNC_DELAY);
}

/**
 * Принудительная синхронизация узла (без debounce)
 */
export async function syncNodeNow(node: Node): Promise<void> {
  // Проверяем авторизацию перед синхронизацией
  if (!(await isUserAuthenticated())) {
    return; // Пользователь не залогинен, пропускаем синхронизацию
  }

  // Очищаем debounce таймер
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  
  try {
    await syncNodeToFirestore(node);
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}

export { syncNodeDebounced };
