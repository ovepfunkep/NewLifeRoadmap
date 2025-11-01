import { describe, it, expect } from 'vitest';
import { Node } from '../types';
import { computeProgress, deadlineStatus, collectDeadlines, sortByDeadlineAsc, remapIds, generateId } from '../utils';

describe('utils', () => {
  describe('computeProgress', () => {
    it('should return 100 if node is completed', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: true,
        createdAt: new Date().toISOString(),
        children: [],
      };
      expect(computeProgress(node)).toBe(100);
    });

    it('should return 0 for empty node without children', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [],
      };
      expect(computeProgress(node)).toBe(0);
    });

    it('should calculate progress based on completed leaves', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [
          {
            id: '2',
            parentId: '1',
            title: 'Child 1',
            completed: true,
            createdAt: new Date().toISOString(),
            children: [],
          },
          {
            id: '3',
            parentId: '1',
            title: 'Child 2',
            completed: false,
            createdAt: new Date().toISOString(),
            children: [],
          },
        ],
      };
      expect(computeProgress(node)).toBe(50);
    });

    it('should consider parent completion for leaf nodes', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [
          {
            id: '2',
            parentId: '1',
            title: 'Child',
            completed: true,
            createdAt: new Date().toISOString(),
            children: [
              {
                id: '3',
                parentId: '2',
                title: 'Leaf',
                completed: false,
                createdAt: new Date().toISOString(),
                children: [],
              },
            ],
          },
        ],
      };
      // Родитель выполнен, значит лист считается выполненным
      expect(computeProgress(node)).toBe(100);
    });
  });

  describe('deadlineStatus', () => {
    it('should return none for node without deadline', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [],
      };
      expect(deadlineStatus(node)).toBe('none');
    });

    it('should return overdue for past deadline', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        deadline: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        children: [],
      };
      expect(deadlineStatus(node)).toBe('overdue');
    });

    it('should return soon for deadline within 3 days', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        deadline: new Date(Date.now() + 2 * 86400000).toISOString(), // 2 days from now
        children: [],
      };
      expect(deadlineStatus(node)).toBe('soon');
    });

    it('should return future for deadline beyond 3 days', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        deadline: new Date(Date.now() + 5 * 86400000).toISOString(), // 5 days from now
        children: [],
      };
      expect(deadlineStatus(node)).toBe('future');
    });
  });

  describe('collectDeadlines', () => {
    it('should collect all deadlines from subtree', () => {
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Root',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [
          {
            id: '2',
            parentId: '1',
            title: 'Child 1',
            completed: false,
            createdAt: new Date().toISOString(),
            deadline: new Date().toISOString(),
            children: [],
          },
          {
            id: '3',
            parentId: '1',
            title: 'Child 2',
            completed: false,
            createdAt: new Date().toISOString(),
            children: [
              {
                id: '4',
                parentId: '3',
                title: 'Grandchild',
                completed: false,
                createdAt: new Date().toISOString(),
                deadline: new Date().toISOString(),
                children: [],
              },
            ],
          },
        ],
      };
      const deadlines = collectDeadlines(node);
      expect(deadlines.length).toBe(2);
      expect(deadlines.map((d: { id: string }) => d.id)).toContain('2');
      expect(deadlines.map((d: { id: string }) => d.id)).toContain('4');
    });
  });

  describe('sortByDeadlineAsc', () => {
    it('should sort nodes by deadline ascending', () => {
      const now = Date.now();
      const nodes: Node[] = [
        {
          id: '1',
          parentId: null,
          title: 'Later',
          completed: false,
          createdAt: new Date().toISOString(),
          deadline: new Date(now + 5 * 86400000).toISOString(),
          children: [],
        },
        {
          id: '2',
          parentId: null,
          title: 'Earlier',
          completed: false,
          createdAt: new Date().toISOString(),
          deadline: new Date(now + 2 * 86400000).toISOString(),
          children: [],
        },
        {
          id: '3',
          parentId: null,
          title: 'Earliest',
          completed: false,
          createdAt: new Date().toISOString(),
          deadline: new Date(now + 86400000).toISOString(),
          children: [],
        },
      ];
      const sorted = sortByDeadlineAsc(nodes);
      expect(sorted[0].id).toBe('3');
      expect(sorted[1].id).toBe('2');
      expect(sorted[2].id).toBe('1');
    });
  });

  describe('remapIds', () => {
    it('should generate new IDs for conflicting nodes', () => {
      const existingIds = new Set(['1', '2']);
      const node: Node = {
        id: '1',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [
          {
            id: '2',
            parentId: '1',
            title: 'Child',
            completed: false,
            createdAt: new Date().toISOString(),
            children: [],
          },
        ],
      };
      const remapped = remapIds(node, existingIds);
      expect(remapped.id).not.toBe('1');
      expect(remapped.children[0].id).not.toBe('2');
    });

    it('should keep non-conflicting IDs', () => {
      const existingIds = new Set(['1', '2']);
      const node: Node = {
        id: '3',
        parentId: null,
        title: 'Test',
        completed: false,
        createdAt: new Date().toISOString(),
        children: [],
      };
      const remapped = remapIds(node, existingIds);
      expect(remapped.id).toBe('3');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });
});

