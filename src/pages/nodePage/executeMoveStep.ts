import type { Dispatch, SetStateAction } from 'react';
import type { Node } from '../../types';
import { getNode, saveNode } from '../../db';
import { syncNodeNow } from '../../db-sync';
import { buildBreadcrumbs } from '../../utils';
import { t } from '../../i18n';
import type { Toast } from '../../hooks/useToast';

export type MoveStepToasts = {
  showToast: (
    message: string,
    undo?: () => void,
    options?: { subtitle?: string; persistent?: boolean; isLoading?: boolean; type?: 'success' | 'warning' | 'error' | 'default' }
  ) => string;
  updateToast: (id: string, updates: Partial<Toast>) => void;
  removeToast: (id: string) => void;
};

/** Re-parents a step under another step: local DB, optional fly-out animation, cloud sync, undo toast. */
export async function executeMoveStep(
  ctx: {
    currentNode: Node;
    effectsEnabled: boolean;
    setAnimatingMoveId: (id: string | null) => void;
    setCurrentNode: Dispatch<SetStateAction<Node | null>>;
    setBreadcrumbs: Dispatch<SetStateAction<Node[]>>;
  } & MoveStepToasts,
  sourceNodeId: string,
  targetNodeId: string
): Promise<void> {
  const {
    currentNode,
    effectsEnabled,
    setAnimatingMoveId,
    showToast,
    updateToast,
    removeToast,
    setCurrentNode,
    setBreadcrumbs,
  } = ctx;

  if (sourceNodeId === targetNodeId) return;

  if (sourceNodeId === 'root-node') {
    showToast('Нельзя переместить корневую задачу');
    return;
  }

  if (effectsEnabled) {
    setAnimatingMoveId(sourceNodeId);
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  const sourceNode = await getNode(sourceNodeId);
  if (!sourceNode) {
    setAnimatingMoveId(null);
    return;
  }

  const isDescendant = (node: Node, targetId: string): boolean => {
    for (const child of node.children) {
      if (child.id === targetId) return true;
      if (isDescendant(child, targetId)) return true;
    }
    return false;
  };

  if (isDescendant(sourceNode, targetNodeId)) {
    showToast('Нельзя переместить задачу в её собственный подшаг');
    setAnimatingMoveId(null);
    return;
  }

  const oldParentId = sourceNode.parentId;
  let oldParent: Node | null = null;
  if (oldParentId) {
    oldParent = await getNode(oldParentId);
  }

  if (oldParent) {
    const updatedChildren = oldParent.children.filter(child => child.id !== sourceNodeId);
    const updatedParent: Node = {
      ...oldParent,
      children: updatedChildren,
      updatedAt: new Date().toISOString(),
    };
    await saveNode(updatedParent);
  }

  const updateParentIds = (node: Node, newParentId: string | null) => {
    node.parentId = newParentId;
    node.updatedAt = new Date().toISOString();
    for (const child of node.children) {
      updateParentIds(child, node.id);
    }
  };

  const targetNode = await getNode(targetNodeId);
  if (!targetNode) {
    setAnimatingMoveId(null);
    return;
  }

  updateParentIds(sourceNode, targetNodeId);
  await saveNode(sourceNode);

  const updatedTarget: Node = {
    ...targetNode,
    children: [...targetNode.children, sourceNode],
    updatedAt: new Date().toISOString(),
  };
  await saveNode(updatedTarget);

  setAnimatingMoveId(null);

  const undoMove = async () => {
    if (!oldParentId || !sourceNode) return;

    const currentSourceNode = await getNode(sourceNodeId);
    const currentTargetNode = await getNode(targetNodeId);
    const currentOldParent = oldParentId ? await getNode(oldParentId) : null;

    if (!currentSourceNode || !currentTargetNode) return;

    const updatedTargetChildren = currentTargetNode.children.filter(child => child.id !== sourceNodeId);
    const rolledBackTarget: Node = {
      ...currentTargetNode,
      children: updatedTargetChildren,
      updatedAt: new Date().toISOString(),
    };
    await saveNode(rolledBackTarget);

    updateParentIds(currentSourceNode, oldParentId || null);
    await saveNode(currentSourceNode);

    const reloadedTarget = await getNode(targetNodeId);
    const reloadedOldParent = currentOldParent ? await getNode(oldParentId) : null;

    if (reloadedTarget && reloadedTarget.children.some(child => child.id === sourceNodeId)) {
      const fixedTargetChildren = reloadedTarget.children.filter(child => child.id !== sourceNodeId);
      const fixedTarget: Node = {
        ...reloadedTarget,
        children: fixedTargetChildren,
        updatedAt: new Date().toISOString(),
      };
      await saveNode(fixedTarget);
    }

    if (reloadedOldParent && !reloadedOldParent.children.some(child => child.id === sourceNodeId)) {
      const fixedOldParent: Node = {
        ...reloadedOldParent,
        children: [...reloadedOldParent.children, currentSourceNode],
        updatedAt: new Date().toISOString(),
      };
      await saveNode(fixedOldParent);
    }

    void (async () => {
      try {
        const finalTarget = await getNode(targetNodeId);
        const finalSource = await getNode(sourceNodeId);
        const finalOldParent = currentOldParent ? await getNode(oldParentId) : null;

        const syncPromises: Promise<void>[] = [];
        if (finalTarget) syncPromises.push(syncNodeNow(finalTarget));
        if (finalSource) syncPromises.push(syncNodeNow(finalSource));
        if (finalOldParent) syncPromises.push(syncNodeNow(finalOldParent));

        Promise.all(syncPromises).catch(error => {
          console.error('[NodePage] Error syncing nodes after undo:', error);
        });

        if (finalSource) {
          const syncSubtree = async (node: Node) => {
            for (const child of node.children) {
              try {
                await syncNodeNow(child);
                await syncSubtree(child);
              } catch (error) {
                console.error(`[NodePage] Error syncing child ${child.id}:`, error);
              }
            }
          };

          syncSubtree(finalSource).catch(error => {
            console.error('[NodePage] Error syncing subtree:', error);
          });
        }
      } catch (error) {
        console.error('[NodePage] Error starting sync:', error);
      }
    })();

    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      const crumbs = await buildBreadcrumbs(reloaded.id, getNode);
      setBreadcrumbs(crumbs);
    }
  };

  const syncToastId = showToast(t('toast.nodeMoved'), undoMove, {
    isLoading: true,
  });

  void (async () => {
    try {
      const syncPromises: Promise<void>[] = [];
      if (oldParent) {
        syncPromises.push(syncNodeNow(oldParent));
      }
      syncPromises.push(syncNodeNow(sourceNode));
      syncPromises.push(syncNodeNow(updatedTarget));

      await Promise.all(syncPromises);

      updateToast(syncToastId, { isLoading: false, isSuccess: true, subtitle: undefined });

      const syncSubtree = async (node: Node) => {
        for (const child of node.children) {
          try {
            await syncNodeNow(child);
            await syncSubtree(child);
          } catch (error) {
            console.error(`[NodePage] Error syncing child ${child.id}:`, error);
          }
        }
      };

      syncSubtree(sourceNode).catch(error => {
        console.error('[NodePage] Error syncing subtree:', error);
      });
    } catch (error) {
      console.error('[NodePage] Error syncing after move:', error);
      removeToast(syncToastId);
      showToast(t('toast.syncError'));
    }
  })();

  const reloaded = await getNode(currentNode.id);
  if (reloaded) {
    setCurrentNode(reloaded);
    const crumbs = await buildBreadcrumbs(reloaded.id, getNode);
    setBreadcrumbs(crumbs);
  }
}
