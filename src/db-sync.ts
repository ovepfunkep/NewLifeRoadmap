import type { Node } from './types';

// Debounce для синхронизации
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DELAY = 500; // 500ms задержка

// Динамический импорт для избежания циклических зависимостей
async function syncNodeToFirestore(node: Node): Promise<void> {
  const { syncNodeToFirestore: syncFn } = await import('./firebase/sync');
  return syncFn(node);
}

/**
 * Синхронизировать узел с Firestore (с debounce)
 */
async function syncNodeDebounced(node: Node): Promise<void> {
  // Очищаем предыдущий таймер
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Устанавливаем новый таймер
  syncTimeout = setTimeout(async () => {
    try {
      await syncNodeToFirestore(node);
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
