import {
  getAllNodesFlat,
  initDB,
  ROOT_NODE_ID,
  saveWeeklyBackupFallbackBody,
  loadWeeklyBackupFallbackBody,
  clearWeeklyBackupFallbackBody,
  restoreFromWeeklyBackupFlat,
} from '../db';
import type { Node } from '../types';

export const WEEKLY_BACKUP_LAST_AT_KEY = 'weeklyLocalBackupLastAt';
export const WEEKLY_BACKUP_ENABLED_KEY = 'weeklyLocalBackupEnabled';
export const WEEKLY_BACKUP_CHANGED_EVENT = 'weeklyLocalBackup:changed';

const OPFS_BACKUP_FILE = 'liferoadmap-weekly-backup.json';
export const WEEKLY_BACKUP_ROOT_DISPLAY_TITLE = 'LifeRoadmap_BackUp';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyBackupFileV1 = { version: 1; exportedAt: string; nodes: Node[] };

export function bumpWeeklyBackupListeners(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WEEKLY_BACKUP_CHANGED_EVENT));
}

export function getWeeklyBackupLastAtIso(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(WEEKLY_BACKUP_LAST_AT_KEY);
}

export function setWeeklyBackupLastAtIso(iso: string): void {
  localStorage.setItem(WEEKLY_BACKUP_LAST_AT_KEY, iso);
  bumpWeeklyBackupListeners();
}

export function isWeeklyLocalBackupEnabled(): boolean {
  return localStorage.getItem(WEEKLY_BACKUP_ENABLED_KEY) === 'true';
}

export function setWeeklyLocalBackupEnabledLocal(v: boolean): void {
  localStorage.setItem(WEEKLY_BACKUP_ENABLED_KEY, v ? 'true' : 'false');
  bumpWeeklyBackupListeners();
}

/** Нужен ли новый снимок по интервалу недели. */
export function shouldRunWeeklyBackupNow(): boolean {
  const last = getWeeklyBackupLastAtIso();
  if (!last) return true;
  const t = new Date(last).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ONE_WEEK_MS;
}

function subscribeWeeklyBackupStorage(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(WEEKLY_BACKUP_CHANGED_EVENT, h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener(WEEKLY_BACKUP_CHANGED_EVENT, h);
    window.removeEventListener('storage', h);
  };
}

function snapshotWeeklyBackupSettings(): string {
  return `${localStorage.getItem(WEEKLY_BACKUP_ENABLED_KEY)}|${localStorage.getItem(WEEKLY_BACKUP_LAST_AT_KEY)}`;
}

/** Реактивное чтение флага и даты (localStorage). */
export function getWeeklyBackupSettingsSubscribe() {
  return { subscribe: subscribeWeeklyBackupStorage, getSnapshot: snapshotWeeklyBackupSettings };
}

async function writeOpfsJson(contents: string): Promise<boolean> {
  const storage = navigator.storage;
  if (!storage?.getDirectory) return false;
  try {
    const root = await storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_BACKUP_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(contents);
    await w.close();
    return true;
  } catch {
    return false;
  }
}

async function readOpfsJson(): Promise<string | null> {
  const storage = navigator.storage;
  if (!storage?.getDirectory) return null;
  try {
    const root = await storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_BACKUP_FILE);
    const file = await fh.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

/** Сырой JSON бэкапа: OPFS или fallback в IndexedDB. */
export async function readWeeklyBackupRaw(): Promise<string | null> {
  const fromOpfs = await readOpfsJson();
  if (fromOpfs && fromOpfs.trim().length > 0) return fromOpfs;
  return loadWeeklyBackupFallbackBody();
}

export function parseWeeklyBackupFile(text: string): WeeklyBackupFileV1 | null {
  try {
    const o = JSON.parse(text) as WeeklyBackupFileV1;
    if (!o || o.version !== 1 || !Array.isArray(o.nodes)) return null;
    return o;
  } catch {
    return null;
  }
}

export function parseWeeklyBackupJson(text: string): Node[] | null {
  return parseWeeklyBackupFile(text)?.nodes ?? null;
}

/** Есть ли валидный бэкап и отметка успеха (для кнопки восстановления). */
export async function hasWeeklyBackupReady(): Promise<boolean> {
  const last = getWeeklyBackupLastAtIso();
  if (!last) return false;
  const raw = await readWeeklyBackupRaw();
  if (!raw || !raw.trim()) return false;
  const nodes = parseWeeklyBackupJson(raw);
  return !!(nodes && nodes.some((n) => n.id === ROOT_NODE_ID));
}

export async function buildWeeklyBackupJson(): Promise<string> {
  await initDB();
  const nodes = await getAllNodesFlat();
  const nodesForFile = nodes.map((n) =>
    n.id === ROOT_NODE_ID
      ? { ...n, children: [] as Node[], title: WEEKLY_BACKUP_ROOT_DISPLAY_TITLE }
      : { ...n, children: [] as Node[] },
  );
  const payload: WeeklyBackupFileV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: nodesForFile,
  };
  return JSON.stringify(payload);
}

/** Запись в OPFS или fallback-store; при успехе OPFS — очистить fallback. */
export async function persistWeeklyBackupJson(json: string): Promise<boolean> {
  const opfsOk = await writeOpfsJson(json);
  if (opfsOk) {
    await clearWeeklyBackupFallbackBody();
    return true;
  }
  try {
    await saveWeeklyBackupFallbackBody(json);
    return true;
  } catch {
    return false;
  }
}

/** Записать свежий бэкап и обновить lastAt (ручная кнопка или по расписанию). */
export async function runWeeklyBackupNow(): Promise<'ok' | 'failed'> {
  try {
    await initDB();
    const json = await buildWeeklyBackupJson();
    const ok = await persistWeeklyBackupJson(json);
    if (!ok) return 'failed';
    setWeeklyBackupLastAtIso(new Date().toISOString());
    return 'ok';
  } catch {
    return 'failed';
  }
}

export type WeeklyBackupRunResult = 'ok' | 'skipped' | 'failed';

/** Создать бэкап, если включено и прошла неделя. */
export async function tryCreateWeeklyBackupIfDue(): Promise<WeeklyBackupRunResult> {
  if (!isWeeklyLocalBackupEnabled()) return 'skipped';
  if (!shouldRunWeeklyBackupNow()) return 'skipped';
  const r = await runWeeklyBackupNow();
  return r === 'ok' ? 'ok' : 'failed';
}

export async function restoreWeeklyBackupFromStorage(): Promise<void> {
  const raw = await readWeeklyBackupRaw();
  if (!raw) throw new Error('NO_BACKUP');
  const nodes = parseWeeklyBackupJson(raw);
  if (!nodes) throw new Error('INVALID_BACKUP');
  await restoreFromWeeklyBackupFlat(nodes);
}
