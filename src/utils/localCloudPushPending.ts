/** Флаг: после сбоя облака есть локальные правки, которые ещё нужно вытолкнуть bulk-синком. */

const KEY = 'lr_sync_push_pending';

export function markLocalCloudPushPending(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

export function clearLocalCloudPushPending(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasLocalCloudPushPending(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
