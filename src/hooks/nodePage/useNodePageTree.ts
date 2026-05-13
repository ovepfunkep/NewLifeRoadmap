import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Node } from '../../types';
import { initDB, getNode, getRoot, saveNode } from '../../db';
import { buildBreadcrumbs } from '../../utils';

type Navigate = (id: string) => void;
type ShowToastFn = (
  message: string,
  undo?: () => void,
  options?: { subtitle?: string; persistent?: boolean; isLoading?: boolean; type?: 'success' | 'warning' | 'error' | 'default' }
) => string;

/**
 * Loads the task tree node for the hash route, builds breadcrumbs, listens for
 * silent reloads after cloud sync.
 */
export function useNodePageTree(options: {
  nodeId: string | null | undefined;
  navigateToNode: Navigate;
  showToast: ShowToastFn;
}): {
  currentNode: Node | null;
  setCurrentNode: Dispatch<SetStateAction<Node | null>>;
  breadcrumbs: Node[];
  setBreadcrumbs: Dispatch<SetStateAction<Node[]>>;
  loading: boolean;
  loadNode: (targetNodeId?: string, silent?: boolean) => Promise<void>;
} {
  const { nodeId, navigateToNode, showToast } = options;
  const [currentNode, setCurrentNode] = useState<Node | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNode = useCallback(
    async (targetNodeId?: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        await initDB();

        const targetId = targetNodeId || nodeId || 'root-node';
        let node = await getNode(targetId);

        if (!node && targetId !== 'root-node') {
          node = await getNode('root-node');

          if (node) {
            navigateToNode('root-node');
            setLoading(false);
            return;
          }
        }

        if (!node && targetId === 'root-node') {
          try {
            node = await getRoot();
          } catch (error) {
            console.error('Error getting root:', error);

            const rootNode: Node = {
              id: 'root-node',
              parentId: null,
              title: 'Ваши Life Roadmaps',
              completed: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              children: [],
            };
            await saveNode(rootNode);
            node = rootNode;
          }
        }

        if (!node) {
          console.error('Failed to load or create root node');
          showToast('Ошибка загрузки задачи');
          setLoading(false);
          return;
        }

        setCurrentNode(node);

        try {
          const crumbs = await buildBreadcrumbs(targetId, getNode);
          setBreadcrumbs(crumbs);
        } catch (breadcrumbError) {
          console.error('Error building breadcrumbs:', breadcrumbError);
          setBreadcrumbs([]);
        }
      } catch (error) {
        console.error('Error loading node:', error);
        showToast('Ошибка загрузки задачи');
      } finally {
        setLoading(false);
      }
    },
    [nodeId, navigateToNode, showToast]
  );

  useEffect(() => {
    void loadNode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when route id changes
  }, [nodeId]);

  useEffect(() => {
    const handleDataUpdated = () => {
      void loadNode(undefined, true);
    };

    window.addEventListener('syncManager:dataUpdated', handleDataUpdated);

    return () => {
      window.removeEventListener('syncManager:dataUpdated', handleDataUpdated);
    };
  }, [loadNode]);

  return {
    currentNode,
    setCurrentNode,
    breadcrumbs,
    setBreadcrumbs,
    loading,
    loadNode,
  };
}
