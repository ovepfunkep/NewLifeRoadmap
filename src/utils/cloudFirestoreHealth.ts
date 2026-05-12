/**
 * Одноразовые уведомления UI: первый сбой Firestore (квота / правила / сеть) → модалка;
 * после первого успешного запроса при активном сбое → модалка восстановления.
 */

export type CloudFirestoreHealthEvent = 'unavailable' | 'restored';

type Listener = (event: CloudFirestoreHealthEvent) => void;

const listeners = new Set<Listener>();

let outageActive = false;

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: string }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: string }).message;
    return typeof m === 'string' ? m : '';
  }
  return '';
}

/** Ошибки, при которых считаем «облако/сеть недоступны», а не баг клиента. */
export function isCloudAccessFailure(err: unknown): boolean {
  const code = getErrorCode(err);
  const msg = getErrorMessage(err);
  if (code === 'permission-denied') return true;
  if (code === 'resource-exhausted') return true;
  if (code === 'unavailable') return true;
  if (msg.includes('TIMEOUT_SYNC:')) return true;
  return false;
}

function emit(event: CloudFirestoreHealthEvent) {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeCloudFirestoreHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Вызов после успешного read/write/listen к Firestore (реальный round-trip). */
export function reportCloudFirestoreSuccess(): void {
  if (!outageActive) return;
  outageActive = false;
  emit('restored');
}

/**
 * Вызов при ошибке Firestore. Идемпотентно: модалка «недоступно» только при переходе в outage.
 */
export function reportCloudFirestoreFailure(err: unknown): void {
  if (!isCloudAccessFailure(err)) return;
  if (outageActive) return;
  outageActive = true;
  emit('unavailable');
}

/** Сброс состояния (например при выходе из аккаунта), без модалок. */
export function resetCloudFirestoreHealth(): void {
  outageActive = false;
}
