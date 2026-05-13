import { useState, useEffect } from 'react';
import type { Node } from '../../types';
import { getNode } from '../../db';

/** Resolves mobile deadlines tab scope from picker id + current tree node. */
export function useMobileDeadlinesScopeNode(
  mobileDeadlinesNodeId: string,
  currentNode: Node | null
): Node | null {
  const [scoped, setScoped] = useState<Node | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!mobileDeadlinesNodeId) {
        setScoped(currentNode);
        return;
      }
      const n = await getNode(mobileDeadlinesNodeId);
      if (cancelled) return;
      setScoped(n ?? currentNode);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mobileDeadlinesNodeId, currentNode]);

  return scoped;
}

/** Resolves mobile dashboard tab scope from picker id. */
export function useMobileDashboardScopeNode(
  mobileDashboardNodeId: string,
  currentNode: Node | null
): Node | null {
  const [scoped, setScoped] = useState<Node | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const n = await getNode(mobileDashboardNodeId);
      if (cancelled) return;
      setScoped(n ?? currentNode);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mobileDashboardNodeId, currentNode]);

  return scoped;
}
