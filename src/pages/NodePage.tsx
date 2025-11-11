import { useState, useEffect, useMemo, useCallback } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { initDB, getNode, getRoot, saveNode, deleteNode } from '../db';
import { buildBreadcrumbs, getTotalChildCount } from '../utils';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { useToast } from '../hooks/useToast';
import { useEffects } from '../hooks/useEffects';
import { Header } from '../components/Header';
import { StepsList } from '../components/StepsList';
import { DeadlineList } from '../components/DeadlineList';
import { EditorModal } from '../components/EditorModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { MoveModal } from '../components/MoveModal';
import { ToastList } from '../components/ToastList';
import { SettingsWidget } from '../components/SettingsWidget';
import { Footer } from '../components/Footer';
import { ConfettiEffect } from '../components/ConfettiEffect';

type SortType = 'none' | 'name' | 'deadline';

export function NodePage() {
  const [nodeId, navigateToNode] = useNodeNavigation();
  const [currentNode, setCurrentNode] = useState<Node | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [sortType, setSortType] = useState<SortType>('none');
  const [filterType, setFilterType] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const { toasts, showToast, updateToast, removeToast } = useToast();
  const { effectsEnabled } = useEffects();
  const [confettiTrigger, setConfettiTrigger] = useState(0); // Изменено на number для поддержки нескольких запусков
  const [confettiChildCount, setConfettiChildCount] = useState(0);

  // Мемоизированный список детей (сортировка и фильтрация теперь в StepsList)
  const sortedChildren = useMemo(() => {
    if (!currentNode) return [];
    return currentNode.children;
  }, [currentNode?.children, currentNode?.id]);

  // Получаем отсортированные и отфильтрованные шаги для shortcuts
  const getVisibleSteps = useMemo(() => {
    if (!currentNode) return [];
    // Фильтрация
    let filtered = currentNode.children.filter(child => {
      if (filterType === 'all') return true;
      if (filterType === 'completed') return child.completed;
      if (filterType === 'incomplete') return !child.completed;
      return true;
    });
    // Сортировка
    filtered = [...filtered].sort((a, b) => {
      // Приоритетные всегда сверху
      if (a.priority && !b.priority) return -1;
      if (!a.priority && b.priority) return 1;
      // Выполненные идут вниз
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      if (sortType === 'name') {
        return a.title.localeCompare(b.title);
      } else if (sortType === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
    return filtered;
  }, [currentNode, sortType, filterType]);

  const handleEdit = useCallback((node: Node) => {
    setEditingNode(node);
    setShowEditor(true);
  }, []);

  const handleCreateChild = useCallback(() => {
    setEditingNode(null);
    setShowEditor(true);
  }, []);

  // Обработка ESC и shortcuts
  useEffect(() => {
    // Проверяем, открыты ли модалки - если да, не обрабатываем события
    if (showEditor || showImportExport || showMoveModal) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Не обрабатывать если пользователь вводит текст
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // ESC - переход к родителю
      if (e.key === 'Escape') {
        if (currentNode && currentNode.parentId && currentNode.id !== 'root-node') {
          navigateToNode(currentNode.parentId);
        }
        return;
      }

      // T - добавить шаг (используем code для независимости от раскладки)
      if (e.code === 'KeyT' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        handleCreateChild();
        return;
      }

      // R - редактировать текущую мапу (используем code для независимости от раскладки)
      if (e.code === 'KeyR' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && currentNode) {
        e.preventDefault();
        setEditingNode(currentNode);
        setShowEditor(true);
        return;
      }

      // CTRL + цифра - переход к крошке (кроме текущей)
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const digit = parseInt(e.key);
        if (!isNaN(digit) && digit >= 1 && digit <= 9) {
          e.preventDefault();
          const targetIndex = digit - 1;
          // Не переходим если цифра >= номеру текущей крошки (текущая крошка - последняя в массиве)
          const currentIndex = breadcrumbs.length - 1;
          if (targetIndex < currentIndex) {
            navigateToNode(breadcrumbs[targetIndex].id);
          }
          return;
        }
      }

      // Цифра без CTRL - переход к шагу
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const digit = parseInt(e.key);
        if (!isNaN(digit) && digit >= 1 && digit <= 9) {
          e.preventDefault();
          const targetIndex = digit - 1;
          if (targetIndex < getVisibleSteps.length) {
            navigateToNode(getVisibleSteps[targetIndex].id);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentNode, showEditor, showImportExport, showMoveModal, navigateToNode, breadcrumbs, getVisibleSteps, handleCreateChild]);

  // Загрузка узла
  useEffect(() => {
    let cancelled = false;
    
    const loadNode = async () => {
      setLoading(true);
      try {
        await initDB();
        
        const targetId = nodeId || 'root-node';
        let node = await getNode(targetId);
        
        if (cancelled) return;
        
        // Если узел не найден и это не root-node, пытаемся загрузить root-node
        if (!node && targetId !== 'root-node') {
          node = await getNode('root-node');
          if (cancelled) return;
          
          if (node) {
            navigateToNode('root-node');
            setLoading(false);
            return;
          }
        }
        
        // Если root-node не найден, создаём его
        if (!node && targetId === 'root-node') {
          // Пытаемся получить root через getRoot, который создаст его если нужно
          try {
            node = await getRoot();
          } catch (error) {
            console.error('Error getting root:', error);
            if (cancelled) return;
            
            // Если и это не помогло, создаём корневой узел вручную
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
        
        if (cancelled) return;
        
        if (!node) {
          console.error('Failed to load or create root node');
          showToast('Ошибка загрузки задачи');
          setLoading(false);
          return;
        }
        
        setCurrentNode(node);
        
        try {
          const crumbs = await buildBreadcrumbs(targetId, getNode);
          
          if (cancelled) return;
          
          setBreadcrumbs(crumbs);
        } catch (breadcrumbError) {
          console.error('Error building breadcrumbs:', breadcrumbError);
          // Устанавливаем пустые breadcrumbs, чтобы не блокировать загрузку
          setBreadcrumbs([]);
        }
      } catch (error) {
        console.error('Error loading node:', error);
        if (!cancelled) {
          showToast('Ошибка загрузки задачи');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadNode();
    
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const handleMarkCompleted = async (id: string, completed: boolean) => {
    if (!currentNode) return;
    
    const findNode = (n: Node): Node | null => {
      if (n.id === id) return n;
      for (const child of n.children) {
        const found = findNode(child);
        if (found) return found;
      }
      return null;
    };
    
    const nodeToUpdate = id === currentNode.id ? currentNode : findNode(currentNode);
    if (!nodeToUpdate) return;
    
    // Если задача завершена и эффекты включены, запускаем конфетти
    if (completed && effectsEnabled) {
      const childCount = getTotalChildCount(nodeToUpdate);
      setConfettiChildCount(childCount);
      // Увеличиваем счетчик триггера для нового запуска конфетти
      setConfettiTrigger(prev => prev + 1);
    }
    
    const updated: Node = {
      ...nodeToUpdate,
      completed,
      updatedAt: new Date().toISOString(),
    };
    
    await saveNode(updated);
    
    // Показываем объединенный тост с иконкой загрузки
    const syncToastId = showToast(t('toast.nodeSaved'), undefined, {
      isLoading: true
    });
    
    // Синхронизируем с облаком асинхронно
    (async () => {
      try {
        const { syncNodeNow } = await import('../db-sync');
        await syncNodeNow(updated);
        
        // Синхронизируем всех родителей вверх по иерархии до корня
        let currentParentId = updated.parentId;
        while (currentParentId) {
          const parent = await getNode(currentParentId);
          if (parent) {
            await syncNodeNow(parent);
            currentParentId = parent.parentId;
          } else {
            break;
          }
        }
        
        // Обновляем тост: заменяем иконку загрузки на галочку
        updateToast(syncToastId, { isLoading: false, isSuccess: true });
      } catch (error) {
        console.error('[NodePage] Error syncing after mark completed:', error);
        // При ошибке просто закрываем тост
        removeToast(syncToastId);
        showToast(t('toast.syncError'));
      }
    })();
    
    // Перезагружаем текущий узел, чтобы обновить прогресс-бар
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      // Также обновляем breadcrumbs если нужно
      try {
        const crumbs = await buildBreadcrumbs(reloaded.id, getNode);
        setBreadcrumbs(crumbs);
      } catch (error) {
        console.error('Error updating breadcrumbs:', error);
      }
    }
  };

  const handleTogglePriority = async (id: string, priority: boolean) => {
    if (!currentNode) return;
    
    const findNode = (n: Node): Node | null => {
      if (n.id === id) return n;
      for (const child of n.children) {
        const found = findNode(child);
        if (found) return found;
      }
      return null;
    };
    
    const nodeToUpdate = id === currentNode.id ? currentNode : findNode(currentNode);
    if (!nodeToUpdate) return;
    
    const updated: Node = {
      ...nodeToUpdate,
      priority,
      updatedAt: new Date().toISOString(),
    };
    
    await saveNode(updated);
    
    // Показываем объединенный тост с иконкой загрузки
    const syncToastId = showToast(t('toast.nodeSaved'), undefined, {
      isLoading: true
    });
    
    // Синхронизируем с облаком асинхронно
    (async () => {
      try {
        const { syncNodeNow } = await import('../db-sync');
        await syncNodeNow(updated);
        // Также синхронизируем всех родителей вверх по иерархии до корня
        let currentParentId = updated.parentId;
        while (currentParentId) {
          const parent = await getNode(currentParentId);
          if (parent) {
            await syncNodeNow(parent);
            currentParentId = parent.parentId;
          } else {
            break;
          }
        }
        
        // Обновляем тост: заменяем иконку загрузки на галочку
        updateToast(syncToastId, { isLoading: false, isSuccess: true });
      } catch (error) {
        console.error('[NodePage] Error syncing after toggle priority:', error);
        // При ошибке просто закрываем тост
        removeToast(syncToastId);
        showToast(t('toast.syncError'));
      }
    })();
    
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
    }
  };

  const handleSave = async (node: Node) => {
    await saveNode(node);
    
    // Показываем объединенный тост с иконкой загрузки
    const syncToastId = showToast(t('toast.nodeSaved'), undefined, {
      isLoading: true
    });
    
    // Синхронизируем с облаком асинхронно
    (async () => {
      try {
        const { syncNodeNow } = await import('../db-sync');
        await syncNodeNow(node);
        // Также синхронизируем всех родителей вверх по иерархии до корня
        let currentParentId = node.parentId;
        while (currentParentId) {
          const parent = await getNode(currentParentId);
          if (parent) {
            await syncNodeNow(parent);
            currentParentId = parent.parentId;
          } else {
            break;
          }
        }
        
        // Обновляем тост: заменяем иконку загрузки на галочку
        updateToast(syncToastId, { isLoading: false, isSuccess: true });
      } catch (error) {
        console.error('[NodePage] Error syncing after save:', error);
        // При ошибке просто закрываем тост
        removeToast(syncToastId);
        showToast(t('toast.syncError'));
      }
    })();
    
    const reloaded = await getNode(currentNode!.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      // Обновляем хлебные крошки после переименования/изменения
      const breadcrumbs = await buildBreadcrumbs(reloaded.id, getNode);
      setBreadcrumbs(breadcrumbs);
    }
  };

  const handleDelete = async (id: string) => {
    const nodeToDelete = currentNode?.children.find(c => c.id === id) || currentNode;
    if (!nodeToDelete) return;
    
    const deletedNode = JSON.parse(JSON.stringify(nodeToDelete));
    const deletedParentId = nodeToDelete.parentId;
    
    await deleteNode(id);
    
    // Синхронизируем удаление с облаком в фоне
    (async () => {
      try {
        const { deleteNodeFromFirestore } = await import('../firebase/sync');
        // Собираем все ID потомков для удаления
        const collectChildrenIds = (node: Node): string[] => {
          const ids = [node.id];
          for (const child of node.children) {
            ids.push(...collectChildrenIds(child));
          }
          return ids;
        };
        const childrenIds = collectChildrenIds(nodeToDelete);
        await deleteNodeFromFirestore(id, childrenIds.slice(1)); // Убираем сам узел из списка детей
        // Также синхронизируем родителя если есть
        if (deletedParentId) {
          const parent = await getNode(deletedParentId);
          if (parent) {
            const { syncNodeNow } = await import('../db-sync');
            await syncNodeNow(parent);
          }
        }
      } catch (error) {
        console.error('[NodePage] Error syncing after delete:', error);
      }
    })();
    
    const reloaded = await getNode(currentNode!.id);
    if (reloaded) {
      setCurrentNode(reloaded);
    }
    
    if (id === currentNode?.id) {
      if (deletedParentId) {
        navigateToNode(deletedParentId);
      } else {
        navigateToNode('root-node');
      }
    }
    
    showToast(t('toast.nodeDeleted'), () => {
      saveNode(deletedNode).then(() => {
        const reload = async () => {
          const reloaded = await getNode(currentNode?.id || 'root-node');
          if (reloaded) setCurrentNode(reloaded);
        };
        reload();
      });
    });
  };

  // Перемещение шага внутрь другого шага
  const handleMoveNode = async (sourceNodeId: string, targetNodeId: string) => {
    if (!currentNode || sourceNodeId === targetNodeId) return;
    
    // Предотвращаем перемещение корневого узла
    if (sourceNodeId === 'root-node') {
      showToast('Нельзя переместить корневую задачу');
      return;
    }

    // Получаем узел для перемещения
    const sourceNode = await getNode(sourceNodeId);
    if (!sourceNode) return;

    // Проверяем, не является ли targetNodeId потомком sourceNodeId (предотвращение рекурсии)
    const isDescendant = (node: Node, targetId: string): boolean => {
      for (const child of node.children) {
        if (child.id === targetId) return true;
        if (isDescendant(child, targetId)) return true;
      }
      return false;
    };
    
    if (isDescendant(sourceNode, targetNodeId)) {
      showToast('Нельзя переместить задачу в её собственный подшаг');
      return;
    }

    // Сохраняем старый родитель для отмены
    const oldParentId = sourceNode.parentId;
    let oldParent: Node | null = null;
    if (oldParentId) {
      oldParent = await getNode(oldParentId);
    }

    // Удаляем из старого родителя
    if (oldParent) {
      const updatedChildren = oldParent.children.filter(child => child.id !== sourceNodeId);
      const updatedParent: Node = {
        ...oldParent,
        children: updatedChildren,
        updatedAt: new Date().toISOString(),
      };
      await saveNode(updatedParent);
    }

    // Обновляем parentId у перемещаемого узла и всех его потомков
    const updateParentIds = (node: Node, newParentId: string | null) => {
      node.parentId = newParentId;
      node.updatedAt = new Date().toISOString();
      for (const child of node.children) {
        updateParentIds(child, node.id);
      }
    };

    // Добавляем в новый родитель
    const targetNode = await getNode(targetNodeId);
    if (!targetNode) return;

    updateParentIds(sourceNode, targetNodeId);
    await saveNode(sourceNode);

    const updatedTarget: Node = {
      ...targetNode,
      children: [...targetNode.children, sourceNode],
      updatedAt: new Date().toISOString(),
    };
    await saveNode(updatedTarget);

    // Показываем объединенный тост с иконкой загрузки
    const syncToastId = showToast(t('toast.nodeMoved'), undefined, {
      isLoading: true
    });

    // Синхронизируем изменения с Firestore (в фоне, не блокируем UI)
    (async () => {
      try {
        const { syncNodeNow } = await import('../db-sync');
        
        // Синхронизируем только критически важные узлы параллельно
        const syncPromises: Promise<void>[] = [];
        if (oldParent) {
          syncPromises.push(syncNodeNow(oldParent));
        }
        syncPromises.push(syncNodeNow(sourceNode));
        syncPromises.push(syncNodeNow(updatedTarget));
        
        // Ждем завершения критических синхронизаций
        await Promise.all(syncPromises);
        
        // Обновляем тост: заменяем иконку загрузки на галочку
        updateToast(syncToastId, { isLoading: false, isSuccess: true });
        
        // Синхронизируем потомков в фоне (не блокируем UI)
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
        
        // Запускаем синхронизацию потомков в фоне без await
        syncSubtree(sourceNode).catch(error => {
          console.error('[NodePage] Error syncing subtree:', error);
        });
      } catch (error) {
        console.error('[NodePage] Error syncing after move:', error);
        // При ошибке просто закрываем тост
        removeToast(syncToastId);
        showToast(t('toast.syncError'));
      }
    })();

    // Перезагружаем текущий узел
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      const breadcrumbs = await buildBreadcrumbs(reloaded.id, getNode);
      setBreadcrumbs(breadcrumbs);
    }

    // Показываем toast с возможностью отмены
    const undoMove = async () => {
      if (!oldParentId || !sourceNode) return;
      
      // Получаем актуальные данные из БД
      const currentSourceNode = await getNode(sourceNodeId);
      const currentTargetNode = await getNode(targetNodeId);
      const currentOldParent = oldParentId ? await getNode(oldParentId) : null;
      
      if (!currentSourceNode || !currentTargetNode) return;

      // Удаляем из нового родителя (целевого) ПЕРВЫМ ДЕЛОМ
      const updatedTargetChildren = currentTargetNode.children.filter(child => child.id !== sourceNodeId);
      const updatedTarget: Node = {
        ...currentTargetNode,
        children: updatedTargetChildren,
        updatedAt: new Date().toISOString(),
      };
      await saveNode(updatedTarget);

      // Затем обновляем parentId у перемещенного узла и всех его потомков
      updateParentIds(currentSourceNode, oldParentId || null);
      await saveNode(currentSourceNode);
      // saveNode автоматически добавит узел в старого родителя, если parentId установлен

      // Проверяем, что узел действительно удален из нового родителя и добавлен в старый
      // Перезагружаем узлы для проверки
      const reloadedTarget = await getNode(targetNodeId);
      const reloadedOldParent = currentOldParent ? await getNode(oldParentId) : null;
      
      // Если узел все еще в новом родителе, удаляем его вручную
      if (reloadedTarget && reloadedTarget.children.some(child => child.id === sourceNodeId)) {
        const fixedTargetChildren = reloadedTarget.children.filter(child => child.id !== sourceNodeId);
        const fixedTarget: Node = {
          ...reloadedTarget,
          children: fixedTargetChildren,
          updatedAt: new Date().toISOString(),
        };
        await saveNode(fixedTarget);
      }
      
      // Если узел не в старом родителе, добавляем его вручную
      if (reloadedOldParent && !reloadedOldParent.children.some(child => child.id === sourceNodeId)) {
        const fixedOldParent: Node = {
          ...reloadedOldParent,
          children: [...reloadedOldParent.children, currentSourceNode],
          updatedAt: new Date().toISOString(),
        };
        await saveNode(fixedOldParent);
      }

      // Синхронизируем изменения (в фоне)
      (async () => {
        try {
          const { syncNodeNow } = await import('../db-sync');
          
          // Получаем финальные версии узлов для синхронизации
          const finalTarget = await getNode(targetNodeId);
          const finalSource = await getNode(sourceNodeId);
          const finalOldParent = currentOldParent ? await getNode(oldParentId) : null;
          
          // Синхронизируем только критически важные узлы
          const syncPromises: Promise<void>[] = [];
          if (finalTarget) syncPromises.push(syncNodeNow(finalTarget));
          if (finalSource) syncPromises.push(syncNodeNow(finalSource));
          if (finalOldParent) syncPromises.push(syncNodeNow(finalOldParent));
          
          Promise.all(syncPromises).then(() => {
            console.log('[NodePage] Nodes synced after undo');
          }).catch(error => {
            console.error('[NodePage] Error syncing nodes after undo:', error);
          });
          
          // Синхронизируем потомков в фоне
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

      // Перезагружаем текущий узел
      const reloaded = await getNode(currentNode.id);
      if (reloaded) {
        setCurrentNode(reloaded);
        const breadcrumbs = await buildBreadcrumbs(reloaded.id, getNode);
        setBreadcrumbs(breadcrumbs);
      }
    };

    // Undo функциональность сохранена, но тост уже показан выше с индикатором загрузки
  };

  // Обработчик drag для перемещения внутрь другого шага
  const handleDragStart = (node: Node) => {
    console.log('[NodePage] handleDragStart', { nodeId: node.id });
    // Предотвращаем перетаскивание корневого узла
    if (node.id === 'root-node') {
      console.log('[NodePage] Root node cannot be dragged');
      return;
    }
    console.log('[NodePage] Setting draggedNode', node.id);
    setDraggedNode(node);
  };

  const handleDragEnd = () => {
    console.log('[NodePage] handleDragEnd', { draggedNodeId: draggedNode?.id, dragOverNodeId });
    if (draggedNode && dragOverNodeId) {
      console.log('[NodePage] Moving node', draggedNode.id, 'to', dragOverNodeId);
      handleMoveNode(draggedNode.id, dragOverNodeId);
    }
    // Сбрасываем состояние перетаскивания
    setDraggedNode(null);
    setDragOverNodeId(null);
  };

  const handleDragOver = (nodeId: string) => {
    console.log('[NodePage] handleDragOver', { nodeId, draggedNodeId: draggedNode?.id });
    if (draggedNode && draggedNode.id !== nodeId) {
      console.log('[NodePage] Setting dragOverNodeId', nodeId);
      setDragOverNodeId(nodeId);
    }
  };

  const handleDragLeave = () => {
    console.log('[NodePage] handleDragLeave');
    // Сбрасываем подсветку только если мышь ушла с карточки
    setDragOverNodeId(null);
  };

  const handleImportExport = () => {
    setShowImportExport(true);
  };

  const handleImportComplete = async () => {
    if (currentNode) {
      const reloaded = await getNode(currentNode.id);
      if (reloaded) {
        setCurrentNode(reloaded);
      }
    }
    showToast(t('toast.importSuccess'));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">{t('general.loading')}</p>
      </div>
    );
  }

  if (!currentNode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">{t('general.notFound')}</p>
      </div>
    );
  }

      return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col" style={{ paddingTop: effectsEnabled ? '30px' : '0' }}>
      <Header 
        node={currentNode} 
        breadcrumbs={breadcrumbs}
        draggedNode={draggedNode}
        dragOverNodeId={dragOverNodeId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnd={handleDragEnd}
        onEdit={handleEdit}
        onImportExport={handleImportExport}
        onMove={() => setShowMoveModal(true)}
        onMarkCompleted={handleMarkCompleted}
        currentNodeId={currentNode.id}
      />
      
            <main className="container mx-auto px-4 py-6">
              {/* Контент: шаги и дедлайны */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Блок шагов */}
                <div className="lg:col-span-2">
                  <StepsList
                    children={sortedChildren}
                    onCreateChild={handleCreateChild}
                    onNavigate={navigateToNode}
                    onMarkCompleted={handleMarkCompleted}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onTogglePriority={handleTogglePriority}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    draggedNode={draggedNode}
                    dragOverNodeId={dragOverNodeId}
                    sortType={sortType}
                    onSortChange={setSortType}
                    filterType={filterType}
                    onFilterChange={setFilterType}
                    currentNodeId={currentNode.id}
                  />
                </div>
                
                {/* Боковая панель с дедлайнами */}
                <div className="lg:col-span-1">
                  <DeadlineList node={currentNode} onNavigate={navigateToNode} />
                </div>
              </div>
      </main>
      
      {/* Модалки */}
      {showEditor && (
        <EditorModal
          node={editingNode}
          parentId={currentNode.id}
          onSave={handleSave}
          onClose={() => {
            setShowEditor(false);
            setEditingNode(null);
          }}
        />
      )}
      
      {showImportExport && (
        <ImportExportModal
          currentNode={currentNode}
          onImport={handleImportComplete}
          onClose={() => setShowImportExport(false)}
        />
      )}
      
      {showMoveModal && currentNode && (
        <MoveModal
          sourceNodeId={currentNode.id}
          onMove={handleMoveNode}
          onClose={() => setShowMoveModal(false)}
        />
      )}
      
      {/* Тосты */}
      <ToastList toasts={toasts} onRemove={removeToast} />
      
      {/* Виджет настроек - закреплен снизу справа */}
      <SettingsWidget />
      
      {/* Footer */}
      <Footer />
      
      {/* Конфетти эффект */}
      <ConfettiEffect trigger={confettiTrigger} childCount={confettiChildCount} />
    </div>
  );
}
