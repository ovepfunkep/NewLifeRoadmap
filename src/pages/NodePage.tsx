import { useState, useEffect, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Node, NodeRecurrence } from '../types';
import { t } from '../i18n';
import { getNode, saveNode, deleteNode } from '../db';
import { getCurrentUser } from '../firebase/auth';
import { syncNodeNow } from '../db-sync';
import { buildBreadcrumbs, getTotalChildCount } from '../utils';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { useToast } from '../hooks/useToast';
import { useIsMobile } from '../hooks/useIsMobile';
import { useNodeDragGlobalListeners } from '../hooks/nodePage/useNodeDragGlobalListeners';
import {
  useMobileDeadlinesScopeNode,
  useMobileDashboardScopeNode,
} from '../hooks/nodePage/useMobileScopeNodes';
import { useNodePageTree } from '../hooks/nodePage/useNodePageTree';
import { executeMoveStep } from './nodePage/executeMoveStep';
import { useEffects } from '../hooks/useEffects';
import { useLanguage } from '../contexts/LanguageContext';
import { Header } from '../components/Header';
import { StepsList } from '../components/StepsList';
import { DeadlineList } from '../components/DeadlineList';
import { EditorModal } from '../components/EditorModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { MoveModal } from '../components/MoveModal';
import { DashboardModal } from '../components/DashboardModal';
import { DashboardContent } from '../components/DashboardContent';
import { SettingsWidget } from '../components/SettingsWidget';
import { DashboardNodePickerModal } from '../components/DashboardNodePickerModal';
import { Footer } from '../components/Footer';
import { ConfettiEffect } from '../components/ConfettiEffect';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MobileBottomNav, MobileSection } from '../components/MobileBottomNav';
import { MobileSettingsTab } from '../components/MobileSettingsTab';
import { FiFolder, FiPlus } from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionDurations, motionTransitions } from '../config/motion';
import { Z_MOBILE_FAB } from '../config/zLayers';
import { AMBIENT_SEASON } from '../config/ambientSeason';
import { SpringTrees } from '../components/SpringTrees';
import { compareChildNodesForListSort, type StepsSortType } from '../utils';

/*
 * NodePage — hash-routed tree screen: loads `Node` from IndexedDB, lists children (StepsList),
 * deadlines/dashboard on mobile tabs, editor/import/move modals, drag-reparent, shortcuts.
 * Heavy logic is split into `hooks/nodePage/*` and `pages/nodePage/executeMoveStep.ts`.
 */

export function NodePage() {
  const [nodeId, navigateToNode] = useNodeNavigation();
  const { showToast, updateToast, removeToast } = useToast();
  const { currentNode, setCurrentNode, breadcrumbs, setBreadcrumbs, loading } = useNodePageTree({
    nodeId,
    navigateToNode,
    showToast,
  });
  const [showEditor, setShowEditor] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [initialDeadline, setInitialDeadline] = useState<Date | undefined>(undefined);
  const [initialRecurring, setInitialRecurring] = useState<NodeRecurrence | undefined>(undefined);
  const [sortType, setSortType] = useState<StepsSortType>('deadline');
  const [sortAscending, setSortAscending] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardNodeId, setDashboardNodeId] = useState<string | null>(null);
  const [nodeToMove, setNodeToMove] = useState<Node | null>(null);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [nodeToDeleteId, setNodeToDeleteId] = useState<string | null>(null);
  const [animatingBurnId, setAnimatingBurnId] = useState<string | null>(null);
  const [animatingMoveId, setAnimatingMoveId] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<MobileSection>('tasks');
  const [editorParentId, setEditorParentId] = useState<string | null>(null);
  const [mobileDeadlinesNodeId, setMobileDeadlinesNodeId] = useState<string>('root-node');
  const [mobileDashboardNodeId, setMobileDashboardNodeId] = useState<string>('root-node');
  const [showDeadlinesScopePicker, setShowDeadlinesScopePicker] = useState(false);
  const [showDashboardScopePicker, setShowDashboardScopePicker] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0); // Изменено на number для поддержки нескольких запусков
  const [confettiChildCount, setConfettiChildCount] = useState(0);
  const { effectsEnabled } = useEffects();
  const { setLanguage } = useLanguage();
  const { allowEssentialMotion } = useMotionPreferences();
  const isMobile = useIsMobile(768);
  const { lastTouchPositionRef } = useNodeDragGlobalListeners({
    draggedNode,
    routeNodeId: nodeId,
    setDragOverNodeId,
  });
  const mobileDeadlinesNode = useMobileDeadlinesScopeNode(mobileDeadlinesNodeId, currentNode);
  const mobileDashboardNode = useMobileDashboardScopeNode(mobileDashboardNodeId, currentNode);

  useEffect(() => {
    if (!isMobile) {
      setMobileSection('tasks');
      setShowDeadlinesScopePicker(false);
      setShowDashboardScopePicker(false);
    }
  }, [isMobile]);

  // Auto-switch language when entering tutorial language branch (matches your tutorial roots)
  useEffect(() => {
    if (!currentNode) return;
    if (currentNode.title === 'Кликни на меня, если понимаешь этот язык!') {
      setLanguage('ru');
    } else if (currentNode.title === 'Click me if you understand this language!') {
      setLanguage('en');
    }
  }, [currentNode, setLanguage]);

  // Мемоизированный список детей (сортировка и фильтрация теперь в StepsList)
  const sortedChildren = useMemo(() => {
    if (!currentNode) return [];
    return currentNode.children.filter(child => !child.deletedAt);
  }, [currentNode?.children, currentNode?.id]);

  const handleSortChange = useCallback((next: StepsSortType) => {
    if (next === sortType) {
      setSortAscending((a) => !a);
    } else {
      setSortType(next);
      setSortAscending(true);
    }
  }, [sortType]);

  // Получаем отсортированные и отфильтрованные шаги для shortcuts
  const getVisibleSteps = useMemo(() => {
    if (!currentNode) return [];
    // Фильтрация
    let filtered = currentNode.children.filter(child => {
      if (child.deletedAt) return false;
      if (filterType === 'all') return true;
      if (filterType === 'completed') return child.completed;
      if (filterType === 'incomplete') return !child.completed;
      return true;
    });
    filtered = [...filtered].sort((a, b) =>
      compareChildNodesForListSort(a, b, sortType, sortAscending),
    );
    return filtered;
  }, [currentNode, sortType, sortAscending, filterType]);

  const handleEdit = useCallback((node: Node) => {
    setEditingNode(node);
    setInitialRecurring(undefined);
    setShowEditor(true);
  }, []);

  const handleCreateChild = useCallback(() => {
    setEditingNode(null);
    setEditorParentId(null);
    setInitialDeadline(undefined);
    setInitialRecurring(undefined);
    setShowEditor(true);
  }, []);

  // Обработчик создания задачи с установленной датой
  const handleCreateTaskWithDate = useCallback((date: Date, recurringPreset?: NodeRecurrence, parentIdOverride?: string) => {
    setEditingNode(null);
    setEditorParentId(parentIdOverride ?? null);
    setInitialDeadline(recurringPreset ? undefined : date);
    setInitialRecurring(recurringPreset);
    setShowEditor(true);
  }, []);

  const handleMobileDeadlineTaskNavigate = useCallback(() => {
    if (isMobile) {
      setMobileSection('tasks');
    }
  }, [isMobile]);

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

      // E - редактировать текущую мапу
      if (e.code === 'KeyE' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && currentNode) {
        e.preventDefault();
        setEditingNode(currentNode);
        setShowEditor(true);
        return;
      }

      // M - переместить
      if (e.code === 'KeyM' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && currentNode && currentNode.id !== 'root-node') {
        e.preventDefault();
        setShowMoveModal(true);
        return;
      }

      // I - импорт
      if (e.code === 'KeyI' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setShowImportExport(true);
        return;
      }

      // D - удалить
      if (e.code === 'KeyD' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && currentNode && currentNode.id !== 'root-node') {
        e.preventDefault();
        handleDelete(currentNode.id);
        return;
      }

      // Enter - выполнить
      if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && currentNode && currentNode.id !== 'root-node') {
        e.preventDefault();
        handleMarkCompleted(currentNode.id, !currentNode.completed);
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
    
    let nodeToUpdate = id === currentNode.id ? currentNode : findNode(currentNode);
    
    // Если узел не найден в текущем поддереве (например, это дедлайн из другой ветки),
    // пробуем загрузить его из базы данных для корректного запуска конфетти
    if (!nodeToUpdate) {
      nodeToUpdate = await getNode(id);
    }
    
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
      completedAt: completed ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    
    await saveNode(updated);
    
    // Уведомляем другие компоненты и вкладки об изменении
    window.dispatchEvent(new CustomEvent('syncManager:dataUpdated'));
    
    // Синхронизируем с облаком асинхронно
    (async () => {
      try {
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
      } catch (error) {
        console.error('[NodePage] Error syncing after mark completed:', error);
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
    
    // Уведомляем другие компоненты и вкладки об изменении
    window.dispatchEvent(new CustomEvent('syncManager:dataUpdated'));
    
    // Синхронизируем с облаком асинхронно
    (async () => {
      try {
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
      } catch (error) {
        console.error('[NodePage] Error syncing after toggle priority:', error);
      }
    })();
    
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
    }
  };

  const handleSave = async (node: Node) => {
    // Сохраняем старое состояние для отмены
    const oldNode = await getNode(node.id);
    const isNew = !oldNode;
    
    await saveNode(node);
    
    const undoAction = async () => {
      if (isNew) {
        await deleteNode(node.id);
        // Если это была новая задача, синхронизируем удаление
        try {
          const { deleteNodeFromFirestore } = await import('../firebase/sync');
          await deleteNodeFromFirestore(node.id, []);
        } catch (e) {
          console.error('Error syncing undo delete:', e);
        }
      } else {
        await saveNode(oldNode);
        // Синхронизируем восстановление
        try {
          await syncNodeNow(oldNode);
        } catch (e) {
          console.error('Error syncing undo save:', e);
        }
      }
      
      // Перезагружаем интерфейс
      if (currentNode) {
        const reloaded = await getNode(currentNode.id);
        if (reloaded) {
          setCurrentNode(reloaded);
          const breadcrumbs = await buildBreadcrumbs(reloaded.id, getNode);
          setBreadcrumbs(breadcrumbs);
        }
      }
    };

    // Показываем объединенный тост с иконкой загрузки
    const syncToastId = showToast(isNew ? t('toast.nodeCreated') : t('toast.nodeSaved'), undoAction, {
      isLoading: true,
      persistent: true,
      ...(getCurrentUser() ? { subtitle: t('toast.syncingCloud') } : {}),
    });
    
    // Синхронизируем с облаком асинхронно
    (async () => {
      try {
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
        updateToast(syncToastId, {
          isLoading: false,
          isSuccess: true,
          persistent: false,
          subtitle: undefined,
        });
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

  const handleDelete = (id: string) => {
    setNodeToDeleteId(id);
  };

  const executeDelete = async (id: string) => {
    setNodeToDeleteId(null);
    const nodeToDelete = currentNode?.children.find(c => c.id === id) || currentNode;
    if (!nodeToDelete) return;

    // Запускаем анимацию удаления только если эффекты включены
    if (effectsEnabled) {
      setAnimatingBurnId(id);
      // Ждем окончания анимации перед физическим удалением
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    const deletedNode = JSON.parse(JSON.stringify(nodeToDelete));
    const deletedParentId = nodeToDelete.parentId;
    
    await deleteNode(id);
    setAnimatingBurnId(null); // Сбрасываем ID после удаления
    
    // Показываем объединенный тост с иконкой загрузки для синхронизации
    const syncToastId = showToast(t('toast.nodeDeleted'), async () => {
      // Отмена удаления
      await saveNode(deletedNode);
      if (id === currentNode?.id) {
        // Если удаляли текущий узел, возвращаемся на него
        navigateToNode(id);
      } else {
        // Иначе просто перезагружаем текущий узел
        const reloaded = await getNode(currentNode?.id || 'root-node');
        if (reloaded) setCurrentNode(reloaded);
      }
    }, {
      isLoading: true,
      persistent: true,
      ...(getCurrentUser() ? { subtitle: t('toast.syncingCloud') } : {}),
    });
    
    // Синхронизируем удаление с облаком асинхронно
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
        
        // ВАЖНО: При удалении мы ждем какое-то время (например, пока висит тост с отменой), 
        // прежде чем удалять в облаке. Либо просто удаляем, а при отмене восстановим.
        // Сейчас мы удаляем сразу в облаке, чтобы данные не висели.
        
        await deleteNodeFromFirestore(id, childrenIds.slice(1)); // Убираем сам узел из списка детей
        
        // Также синхронизируем родителя если есть
        if (deletedParentId) {
          const parent = await getNode(deletedParentId);
          if (parent) {
            await syncNodeNow(parent);
            
            // Синхронизируем всех родителей вверх по иерархии до корня
            let currentParentId = parent.parentId;
            while (currentParentId) {
              const grandParent = await getNode(currentParentId);
              if (grandParent) {
                await syncNodeNow(grandParent);
                currentParentId = grandParent.parentId;
              } else {
                break;
              }
            }
          }
        }
        
        // Обновляем тост: заменяем иконку загрузки на галочку
        updateToast(syncToastId, {
          isLoading: false,
          isSuccess: true,
          persistent: false,
          subtitle: undefined,
        });
      } catch (error) {
        console.error('[NodePage] Error syncing after delete:', error);
        // При ошибке просто закрываем тост
        removeToast(syncToastId);
        showToast(t('toast.syncError'));
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
  };

  const handleMoveNode = useCallback(
    async (sourceNodeId: string, targetNodeId: string) => {
      if (!currentNode) return;
      await executeMoveStep(
        {
          currentNode,
          effectsEnabled,
          setAnimatingMoveId,
          showToast,
          updateToast,
          removeToast,
          setCurrentNode,
          setBreadcrumbs,
        },
        sourceNodeId,
        targetNodeId
      );
    },
    [currentNode, effectsEnabled, showToast, updateToast, removeToast, setCurrentNode, setBreadcrumbs]
  );

  // Обработчик drag для перемещения внутрь другого шага
  const handleDragStart = (node: Node) => {
    if (node.id === 'root-node') {
      return;
    }
    // Синхронно, чтобы соседние карточки сразу получили draggedNode и подсветку (иначе один кадр без hint).
    flushSync(() => {
      setDraggedNode(node);
    });
  };

  const handleDragEnd = useCallback(() => {
    // Используем функциональное обновление состояния для получения актуальных значений
    setDragOverNodeId((currentDragOverNodeId) => {
      setDraggedNode((currentDraggedNode) => {
        // Проверяем позицию в момент touchend, если есть сохраненная позиция
        let finalDragOverNodeId = currentDragOverNodeId;
        
        if (lastTouchPositionRef.current && currentDraggedNode) {
          const { x, y } = lastTouchPositionRef.current;
          const allCards = document.querySelectorAll('[data-node-id]');
          
          // Проверяем, над какой карточкой или крошкой палец в момент touchend
          for (const card of allCards) {
            const htmlCard = card as HTMLElement;
            const cardNodeId = htmlCard.getAttribute('data-node-id');
            
            if (!cardNodeId || cardNodeId === currentDraggedNode.id) continue;
            // Запрещаем перетаскивание в текущий узел
            if (cardNodeId === nodeId) continue;
            
            const rect = htmlCard.getBoundingClientRect();
            const isInside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
            
            if (isInside) {
              finalDragOverNodeId = cardNodeId;
              break;
            }
          }
        }
        
        if (currentDraggedNode && finalDragOverNodeId) {
          const nodeIdToMove = currentDraggedNode.id;
          const targetId = finalDragOverNodeId;
          setTimeout(() => {
            handleMoveNode(nodeIdToMove, targetId);
          }, 0);
        }
        
        // Сбрасываем сохраненную позицию
        lastTouchPositionRef.current = null;
        
        return null; // Сбрасываем draggedNode
      });
      return null; // Сбрасываем dragOverNodeId
    });
  }, [handleMoveNode, nodeId]);

  const handleDragOver = (nodeId: string) => {
    if (draggedNode && draggedNode.id !== nodeId) {
      setDragOverNodeId(nodeId);
    }
  };

  const handleDragLeave = () => {
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
    
    // Показываем тост с индикатором загрузки для синхронизации
    const syncToastId = showToast(t('toast.importSuccess'), undefined, {
      isLoading: true,
      persistent: true,
      ...(getCurrentUser() ? { subtitle: t('toast.syncingCloud') } : {}),
    });
    
    // Синхронизируем все узлы с облаком асинхронно (только если пользователь залогинен)
    (async () => {
      try {
        const user = getCurrentUser();
        
        if (!user) {
          // Пользователь не залогинен, закрываем тост без синхронизации
          removeToast(syncToastId);
          return;
        }
        
        const { getAllNodesFlat } = await import('../db');
        const { syncAllNodesToFirestore, loadAllNodesFromFirestore } = await import('../firebase/sync');
        const allNodes = await getAllNodesFlat();
        const cloud = await loadAllNodesFromFirestore(false);
        await syncAllNodesToFirestore(allNodes, cloud);
        
        // Обновляем тост: заменяем иконку загрузки на галочку
        updateToast(syncToastId, {
          isLoading: false,
          isSuccess: true,
          persistent: false,
          subtitle: undefined,
        });
      } catch (error: any) {
        console.error('[NodePage] Error syncing after import:', error);
        
        // Закрываем индикатор загрузки и показываем ошибку
        removeToast(syncToastId);
        
        if (error?.code === 'resource-exhausted' || error?.message?.includes('TIMEOUT_SYNC')) {
          showToast('Облако временно недоступно (превышена квота)', undefined, { type: 'error' });
        } else {
          showToast(t('toast.syncError'));
        }
      }
    })();
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

  const activeDeadlinesNode = mobileDeadlinesNode ?? currentNode;

  return (
    <>
      {/* fixed вне overflow-x — иначе iOS Safari; без отдельной «полосы» — только слой деревьев по Z */}
      {isMobile && AMBIENT_SEASON === 'spring' && <SpringTrees />}
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-100 dark:bg-gray-900">

      {/* Конфетти эффект */}
      <ConfettiEffect trigger={confettiTrigger} childCount={confettiChildCount} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentNode.id}
          initial={allowEssentialMotion ? { opacity: 0, y: 14 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={allowEssentialMotion ? { opacity: 0, y: -10 } : { opacity: 1 }}
          transition={allowEssentialMotion ? motionTransitions.fade : { duration: motionDurations.fast }}
        >
          {(!isMobile || mobileSection === 'tasks') && (
            <Header
              node={currentNode}
              breadcrumbs={breadcrumbs}
              draggedNode={draggedNode}
              dragOverNodeId={dragOverNodeId}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onImportExport={handleImportExport}
              onMove={() => setShowMoveModal(true)}
              onOpenDashboard={!isMobile ? () => {
                setDashboardNodeId(currentNode.id);
                setShowDashboard(true);
              } : undefined}
              onMarkCompleted={handleMarkCompleted}
              onTogglePriority={handleTogglePriority}
              currentNodeId={currentNode.id}
            />
          )}

          <main className={`container mx-auto px-4 py-6 lg:px-2 xl:px-4 ${isMobile ? 'pb-[calc(88px+env(safe-area-inset-bottom))]' : ''}`}>
            {!isMobile && (
              <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:gap-4">
                <div className="lg:col-span-1 lg:order-2">
                  <DeadlineList
                    node={currentNode}
                    onNavigate={navigateToNode}
                    onNavigateToTask={handleMobileDeadlineTaskNavigate}
                    onMarkCompleted={handleMarkCompleted}
                    onCreateTask={(date, recurringPreset) => handleCreateTaskWithDate(date, recurringPreset)}
                  />
                </div>

                <div className="min-w-0 lg:col-span-2 lg:order-1">
                  {/* Та же визуальная «карточка», что у DeadlineList на lg+ */}
                  <div className="flex min-h-[140px] flex-col rounded-lg bg-white py-4 transition-all md:p-5 lg:rounded-xl dark:bg-gray-800">
                    <StepsList
                      children={sortedChildren}
                      onNavigate={navigateToNode}
                      onMarkCompleted={handleMarkCompleted}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onTogglePriority={handleTogglePriority}
                      onMove={(node) => {
                        setNodeToMove(node);
                        setShowMoveModal(true);
                      }}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      draggedNode={draggedNode}
                      dragOverNodeId={dragOverNodeId}
                      sortType={sortType}
                      sortAscending={sortAscending}
                      onSortChange={handleSortChange}
                      filterType={filterType}
                      onFilterChange={setFilterType}
                      currentNodeId={currentNode.id}
                      animatingBurnId={animatingBurnId}
                      animatingMoveId={animatingMoveId}
                      onAddStep={handleCreateChild}
                    />
                  </div>
                </div>
              </div>
            )}

            {isMobile && mobileSection === 'tasks' && (
              <StepsList
                children={sortedChildren}
                onNavigate={navigateToNode}
                onMarkCompleted={handleMarkCompleted}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTogglePriority={handleTogglePriority}
                onMove={(node) => {
                  setNodeToMove(node);
                  setShowMoveModal(true);
                }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                draggedNode={draggedNode}
                dragOverNodeId={dragOverNodeId}
                sortType={sortType}
                sortAscending={sortAscending}
                onSortChange={handleSortChange}
                filterType={filterType}
                onFilterChange={setFilterType}
                currentNodeId={currentNode.id}
                animatingBurnId={animatingBurnId}
                animatingMoveId={animatingMoveId}
              />
            )}

            {isMobile && mobileSection === 'deadlines' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowDeadlinesScopePicker(true)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-sm font-medium text-gray-700 transition-colors hover:text-accent dark:text-gray-200"
                  title={t('deadline.chooseScope')}
                >
                  <FiFolder size={16} className="shrink-0" />
                  <span className="truncate">{activeDeadlinesNode?.title || t('general.loading')}</span>
                </button>
                <DeadlineList
                  node={activeDeadlinesNode}
                  onNavigate={navigateToNode}
                  onNavigateToTask={handleMobileDeadlineTaskNavigate}
                  onMarkCompleted={handleMarkCompleted}
                  onCreateTask={(date, recurringPreset) =>
                    handleCreateTaskWithDate(date, recurringPreset, activeDeadlinesNode.id)
                  }
                />
              </div>
            )}

            {isMobile && mobileSection === 'dashboard' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowDashboardScopePicker(true)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-sm font-medium text-gray-700 transition-colors hover:text-accent dark:text-gray-200"
                  title={t('deadline.chooseScope')}
                >
                  <FiFolder size={16} className="shrink-0" />
                  <span className="truncate">{mobileDashboardNode?.title || t('general.loading')}</span>
                </button>
                <DashboardContent
                  initialNodeId={mobileDashboardNodeId || currentNode.id}
                  onSelectedNodeChange={setMobileDashboardNodeId}
                  showNodePicker={false}
                  className="flex min-h-[calc(100vh-240px)] w-full flex-col overflow-hidden"
                />
              </div>
            )}

            {isMobile && mobileSection === 'settings' && <MobileSettingsTab />}
          </main>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showEditor && (
          <EditorModal
            node={editingNode}
            parentId={editorParentId || currentNode.id}
            onSave={handleSave}
            initialDeadline={initialDeadline}
            initialRecurring={initialRecurring}
            onClose={() => {
              setShowEditor(false);
              setEditingNode(null);
              setEditorParentId(null);
              setInitialDeadline(undefined);
              setInitialRecurring(undefined);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImportExport && (
          <ImportExportModal
            currentNode={currentNode}
            onImport={handleImportComplete}
            onClose={() => setShowImportExport(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMoveModal && (nodeToMove || currentNode) && (
          <MoveModal
            sourceNodeId={nodeToMove ? nodeToMove.id : currentNode.id}
            onMove={handleMoveNode}
            onClose={() => {
              setShowMoveModal(false);
              setNodeToMove(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDashboard && (
          <DashboardModal
            initialNodeId={dashboardNodeId || currentNode.id}
            onClose={() => setShowDashboard(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nodeToDeleteId && (
          <ConfirmDialog
            title={t('general.delete')}
            message={t('node.deleteConfirm')}
            onConfirm={() => executeDelete(nodeToDeleteId)}
            onCancel={() => setNodeToDeleteId(null)}
            isDangerous={true}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeadlinesScopePicker && (
          <DashboardNodePickerModal
            selectedNodeId={mobileDeadlinesNodeId}
            onSelectNode={setMobileDeadlinesNodeId}
            onClose={() => setShowDeadlinesScopePicker(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDashboardScopePicker && (
          <DashboardNodePickerModal
            selectedNodeId={mobileDashboardNodeId}
            onSelectNode={setMobileDashboardNodeId}
            onClose={() => setShowDashboardScopePicker(false)}
          />
        )}
      </AnimatePresence>

      {!isMobile && <SettingsWidget />}

      {isMobile && mobileSection === 'tasks' && (
        <button
          onClick={handleCreateChild}
          className="fixed right-4 flex h-12 w-12 items-center justify-center rounded-xl text-white transition-all hover:brightness-110"
          style={{
            zIndex: Z_MOBILE_FAB,
            bottom: 'calc(88px + env(safe-area-inset-bottom))',
            backgroundColor: 'var(--accent)',
            boxShadow: '0 10px 24px rgba(var(--accent-rgb), 0.35)',
          }}
          aria-label={t('node.createChild')}
        >
          <FiPlus size={24} />
        </button>
      )}

      {!isMobile && <Footer />}
      {isMobile && <MobileBottomNav activeSection={mobileSection} onSectionChange={setMobileSection} />}
    </div>
    </>
  );
}
