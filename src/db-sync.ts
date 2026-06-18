import type { Node } from './types';
import { isCloudAccessFailure, isCloudSyncReachable } from './utils/cloudFirestoreHealth';
import { markLocalCloudPushPending } from './utils/localCloudPushPending';

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

/** Отложить push, если сеть/облако недоступны (локальные правки уже сохранены). */
function deferCloudPushIfUnreachable(): boolean {
  if (isCloudSyncReachable()) return false;
  markLocalCloudPushPending();
  return true;
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
      if (!(await isUserAuthenticated())) return;
      if (deferCloudPushIfUnreachable()) return;
      await syncNodeToFirestore(node);
    } catch (error) {
      console.error('Background sync error:', error);
      if (isCloudAccessFailure(error)) {
        markLocalCloudPushPending();
      }
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

  // Офлайн или активный outage — откладываем без ошибки (локально уже сохранено)
  if (deferCloudPushIfUnreachable()) {
    return;
  }

  // Очищаем debounce таймер
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  if (!(await isSecurityReady())) {
    console.warn('[Sync] Security not ready, skipping immediate sync');
    return;
  }
  
  try {
    await syncNodeToFirestore(node);
  } catch (error) {
    console.error('Sync error:', error);
    if (isCloudAccessFailure(error)) {
      markLocalCloudPushPending();
    }
    throw error;
  }
}

/**
 * Удалить узел из облака (с gate по доступности сети/облака).
 */
export async function deleteNodeFromCloudNow(
  nodeId: string,
  childrenIds: string[] = [],
): Promise<void> {
  if (!(await isUserAuthenticated())) {
    return;
  }

  if (deferCloudPushIfUnreachable()) {
    return;
  }

  try {
    const { deleteNodeFromFirestore } = await import('./firebase/sync');
    await deleteNodeFromFirestore(nodeId, childrenIds);
  } catch (error) {
    console.error('Delete sync error:', error);
    if (isCloudAccessFailure(error)) {
      markLocalCloudPushPending();
    }
    throw error;
  }
}

export { syncNodeDebounced };
