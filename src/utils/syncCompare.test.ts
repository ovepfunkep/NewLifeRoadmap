import { describe, it, expect } from 'vitest';
import { Node } from '../types';
import {
  nodeUpdatedAtMs,
  pickNewerNodeByUpdatedAt,
  isSignificantNodeDiff,
  hasDifferences,
  compareNodes,
} from './syncCompare';

const base = (over: Partial<Node>): Node => ({
  id: '1',
  parentId: null,
  title: 'T',
  completed: false,
  createdAt: '2020-01-01T00:00:00.000Z',
  children: [],
  ...over,
});

describe('syncCompare', () => {
  describe('nodeUpdatedAtMs', () => {
    it('returns 0 for missing updatedAt', () => {
      expect(nodeUpdatedAtMs(undefined)).toBe(0);
      expect(nodeUpdatedAtMs(base({ updatedAt: undefined }))).toBe(0);
    });

    it('parses valid ISO date', () => {
      const ms = nodeUpdatedAtMs(base({ updatedAt: '2024-06-01T12:00:00.000Z' }));
      expect(ms).toBe(new Date('2024-06-01T12:00:00.000Z').getTime());
    });
  });

  describe('pickNewerNodeByUpdatedAt', () => {
    it('returns incoming when no local', () => {
      const incoming = base({ id: 'a', updatedAt: '2024-01-01T00:00:00.000Z' });
      const got = pickNewerNodeByUpdatedAt(undefined, incoming);
      expect(got.id).toBe('a');
      expect(got.children).toEqual([]);
    });

    it('prefers strictly newer incoming', () => {
      const local = base({ id: 'a', updatedAt: '2024-01-01T00:00:00.000Z' });
      const incoming = base({ id: 'a', title: 'New', updatedAt: '2024-02-01T00:00:00.000Z' });
      const got = pickNewerNodeByUpdatedAt(local, incoming);
      expect(got.title).toBe('New');
    });

    it('keeps local when newer or same time', () => {
      const local = base({ id: 'a', title: 'Local', updatedAt: '2024-03-01T00:00:00.000Z' });
      const older = base({ id: 'a', title: 'OldCloud', updatedAt: '2024-02-01T00:00:00.000Z' });
      expect(pickNewerNodeByUpdatedAt(local, older).title).toBe('Local');
      const same = base({ id: 'a', title: 'Cloud', updatedAt: '2024-03-01T00:00:00.000Z' });
      expect(pickNewerNodeByUpdatedAt(local, same).title).toBe('Local');
    });
  });

  describe('isSignificantNodeDiff', () => {
    it('false when both deleted', () => {
      const a = base({ deletedAt: '2024-01-01T00:00:00.000Z' });
      const b = base({ deletedAt: '2024-02-01T00:00:00.000Z' });
      expect(isSignificantNodeDiff(a, b)).toBe(false);
    });

    it('true when delete status differs', () => {
      const active = base({});
      const del = base({ deletedAt: '2024-01-01T00:00:00.000Z' });
      expect(isSignificantNodeDiff(active, del)).toBe(true);
      expect(isSignificantNodeDiff(del, active)).toBe(true);
    });

    it('true on title change when both active', () => {
      expect(isSignificantNodeDiff(base({ title: 'a' }), base({ title: 'b' }))).toBe(true);
    });

    it('false when deadline is undefined vs null', () => {
      expect(
        isSignificantNodeDiff(
          base({ deadline: undefined }),
          base({ deadline: null }),
        ),
      ).toBe(false);
    });

    it('false when deletedAt is undefined vs null', () => {
      expect(
        isSignificantNodeDiff(
          base({ deletedAt: undefined }),
          base({ deletedAt: null }),
        ),
      ).toBe(false);
      expect(hasDifferences([base({ id: 'a', deletedAt: undefined })], [base({ id: 'a', deletedAt: null })])).toBe(
        false,
      );
    });

    it('false for equivalent recurrence with reordered scheduleVariants', () => {
      const r1 = {
        freq: 'weekly' as const,
        scheduleVariants: [{ weekdays: [1], timeStart: '09:00' }],
      };
      const r2 = {
        freq: 'weekly' as const,
        scheduleVariants: [{ timeStart: '09:00', weekdays: [1] }],
      };
      expect(
        isSignificantNodeDiff(
          base({ isRecurring: true, recurrence: r1 }),
          base({ isRecurring: true, recurrence: r2 }),
        ),
      ).toBe(false);
    });
  });

  describe('hasDifferences / compareNodes', () => {
    it('false for identical single node', () => {
      const n = base({ id: 'r' });
      expect(hasDifferences([n], [{ ...n, children: [] }])).toBe(false);
    });

    it('detects local-only non-deleted', () => {
      const local = base({ id: 'x' });
      expect(hasDifferences([local], [])).toBe(true);
    });

    it('compareNodes lists localOnly', () => {
      const n = base({ id: 'only' });
      const d = compareNodes([n], []);
      expect(d.localOnly).toHaveLength(1);
      expect(d.cloudOnly).toHaveLength(0);
    });
  });
});
