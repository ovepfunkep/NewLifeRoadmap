import { useState, useEffect, useMemo, useCallback } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { initDB, getNode, saveNode, deleteNode } from '../db';
import { buildBreadcrumbs } from '../utils';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { useToast } from '../hooks/useToast';
import { Header } from '../components/Header';
import { StepsList } from '../components/StepsList';
import { DeadlineList } from '../components/DeadlineList';
import { EditorModal } from '../components/EditorModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { MoveModal } from '../components/MoveModal';
import { ToastList } from '../components/ToastList';
import { SettingsWidget } from '../components/SettingsWidget';
import { Footer } from '../components/Footer';

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
  const { toasts, showToast, removeToast } = useToast();

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
    const handleKeyDown = (e: KeyboardEvent) => {
      // Не обрабатывать если пользователь вводит текст
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // ESC - закрытие модалок или переход к родителю
      if (e.key === 'Escape') {
        if (showEditor || showImportExport || showMoveModal) {
          return; // Модалки сами обработают
        }
        if (currentNode && currentNode.parentId && currentNode.id !== 'root-node') {
          navigateToNode(currentNode.parentId);
        }
        return;
      }

      // T - добавить шаг (используем code для независимости от раскладки)
      if (e.code === 'KeyT' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (!showEditor && !showImportExport && !showMoveModal) {
          e.preventDefault();
          handleCreateChild();
        }
        return;
      }

      // R - редактировать текущую мапу (используем code для независимости от раскладки)
      if (e.code === 'KeyR' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (!showEditor && !showImportExport && !showMoveModal && currentNode) {
          e.preventDefault();
          setEditingNode(currentNode);
          setShowEditor(true);
        }
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
  }, [currentNode, showEditor, showImportExport, showMoveModal, navigateToNode, breadcrumbs, getVisibleSteps, handleEdit, handleCreateChild]);

  // Загрузка узла
  useEffect(() => {
    const loadNode = async () => {
      setLoading(true);
      try {
        await initDB();
        
        const targetId = nodeId || 'root-node';
        const node = await getNode(targetId);
        
        if (!node) {
          navigateToNode('root-node');
          return;
        }
        
        setCurrentNode(node);
        const crumbs = await buildBreadcrumbs(targetId, getNode);
        setBreadcrumbs(crumbs);
      } catch (error) {
        console.error('Error loading node:', error);
        showToast('Ошибка загрузки задачи');
      } finally {
        setLoading(false);
      }
    };
    
    loadNode();
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
    
    const updated: Node = {
      ...nodeToUpdate,
      completed,
      updatedAt: new Date().toISOString(),
    };
    
    await saveNode(updated);
    
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      showToast(t('toast.nodeSaved'));
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
    
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      showToast(t('toast.nodeSaved'));
    }
  };

  const handleSave = async (node: Node) => {
    await saveNode(node);
    
    const reloaded = await getNode(currentNode!.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      // Обновляем хлебные крошки после переименования/изменения
      const breadcrumbs = await buildBreadcrumbs(reloaded.id, getNode);
      setBreadcrumbs(breadcrumbs);
      showToast(t('toast.nodeSaved'));
    }
  };

  const handleDelete = async (id: string) => {
    const nodeToDelete = currentNode?.children.find(c => c.id === id) || currentNode;
    if (!nodeToDelete) return;
    
    const deletedNode = JSON.parse(JSON.stringify(nodeToDelete));
    const deletedParentId = nodeToDelete.parentId;
    
    await deleteNode(id);
    
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

    // Удаляем из старого родителя
    if (sourceNode.parentId) {
      const oldParent = await getNode(sourceNode.parentId);
      if (oldParent) {
        const updatedChildren = oldParent.children.filter(child => child.id !== sourceNodeId);
        const updatedParent: Node = {
          ...oldParent,
          children: updatedChildren,
          updatedAt: new Date().toISOString(),
        };
        await saveNode(updatedParent);
      }
    }

    // Обновляем parentId у перемещаемого узла и всех его потомков
    const updateParentIds = (node: Node, newParentId: string) => {
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

    // Перезагружаем текущий узел
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
      const breadcrumbs = await buildBreadcrumbs(reloaded.id, getNode);
      setBreadcrumbs(breadcrumbs);
    }

    showToast(t('toast.nodeMoved'));
  };

  // Обработчик drag для перемещения внутрь другого шага
  const handleDragStart = (node: Node) => {
    // Предотвращаем перетаскивание корневого узла
    if (node.id === 'root-node') {
      return;
    }
    setDraggedNode(node);
  };

  const handleDragEnd = () => {
    if (draggedNode && dragOverNodeId) {
      handleMoveNode(draggedNode.id, dragOverNodeId);
    }
    setDraggedNode(null);
    setDragOverNodeId(null);
  };

  const handleDragOver = (nodeId: string) => {
    if (draggedNode && draggedNode.id !== nodeId) {
      setDragOverNodeId(nodeId);
    }
  };

  const handleDragLeave = () => {
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
        <p className="text-gray-600 dark:text-gray-400">Задача не найдена</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
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
    </div>
  );
}
