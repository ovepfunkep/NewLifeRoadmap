import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isCloudSyncReachable,
  isCloudFirestoreOutageActive,
  notifyBrowserWentOffline,
  reportCloudFirestoreFailure,
  reportCloudFirestoreSuccess,
  resetCloudFirestoreHealth,
  subscribeCloudFirestoreHealth,
} from './cloudFirestoreHealth';

describe('cloudFirestoreHealth', () => {
  beforeEach(() => {
    resetCloudFirestoreHealth();
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isCloudSyncReachable', () => {
    it('returns true when online and no outage', () => {
      expect(isCloudSyncReachable()).toBe(true);
      expect(isCloudFirestoreOutageActive()).toBe(false);
    });

    it('returns false when navigator is offline', () => {
      vi.stubGlobal('navigator', { onLine: false });
      expect(isCloudSyncReachable()).toBe(false);
    });

    it('returns false after cloud access failure until success', () => {
      reportCloudFirestoreFailure({ code: 'unavailable' });
      expect(isCloudFirestoreOutageActive()).toBe(true);
      expect(isCloudSyncReachable()).toBe(false);

      reportCloudFirestoreSuccess();
      expect(isCloudFirestoreOutageActive()).toBe(false);
      expect(isCloudSyncReachable()).toBe(true);
    });

    it('ignores non-access failures for outage state', () => {
      reportCloudFirestoreFailure(new Error('internal bug'));
      expect(isCloudFirestoreOutageActive()).toBe(false);
      expect(isCloudSyncReachable()).toBe(true);
    });
  });

  describe('notifyBrowserWentOffline', () => {
    it('enters outage and blocks sync until success', () => {
      notifyBrowserWentOffline();
      expect(isCloudFirestoreOutageActive()).toBe(true);
      expect(isCloudSyncReachable()).toBe(false);

      notifyBrowserWentOffline();
      expect(isCloudFirestoreOutageActive()).toBe(true);
    });

    it('emits unavailable once and restored after probe success', () => {
      const events: string[] = [];
      const unsub = subscribeCloudFirestoreHealth((ev) => events.push(ev));

      notifyBrowserWentOffline();
      notifyBrowserWentOffline();
      expect(events).toEqual(['unavailable']);

      reportCloudFirestoreSuccess();
      expect(events).toEqual(['unavailable', 'restored']);
      expect(isCloudFirestoreOutageActive()).toBe(false);

      unsub();
    });
  });
});
