import { useState, useEffect, useMemo } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { initDB, getNode, saveNode, deleteNode } from '../db';
import { buildBreadcrumbs } from '../utils';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { useToast } from '../hooks/useToast';
import { Header } from '../components/Header';
import { NodeCard } from '../components/NodeCard';
import { DeadlineList } from '../components/DeadlineList';
import { EditorModal } from '../components/EditorModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { MoveModal } from '../components/MoveModal';
import { ToastList } from '../components/ToastList';
import { FiCalendar } from 'react-icons/fi';
import { FaSort } from 'react-icons/fa';
import { Tooltip } from '../components/Tooltip';

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
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  // Мемоизированный отсортированный список детей
  const sortedChildren = useMemo(() => {
    if (!currentNode) return [];
    const children = currentNode.children;
    const priority = children.filter(c => c.priority);
    const normal = children.filter(c => !c.priority);
    const sortedPriority = [...priority].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const sortedNormal = [...normal].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let result = [...sortedPriority, ...sortedNormal];
    
    if (sortType === 'name') {
      result = result.sort((a, b) => a.title.localeCompare(b.title));
      const priority2 = result.filter(c => c.priority);
      const normal2 = result.filter(c => !c.priority);
      result = [...priority2, ...normal2];
    } else if (sortType === 'deadline') {
      result = result.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
      });
      const priority2 = result.filter(c => c.priority);
      const normal2 = result.filter(c => !c.priority);
      result = [...priority2, ...normal2];
    }
    return result;
  }, [currentNode?.children, currentNode?.id, sortType]);

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

  const handleEdit = (node: Node) => {
    setEditingNode(node);
    setShowEditor(true);
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

  const handleCreateChild = () => {
    setEditingNode(null);
    setShowEditor(true);
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header node={currentNode} breadcrumbs={breadcrumbs} />
      
      <main className="container mx-auto px-4 py-6">
        {/* Панель действий */}
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <button
            onClick={handleCreateChild}
            className="px-4 py-2 rounded-lg text-white transition-colors"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('node.createChild')}
          </button>
          
          <button
            onClick={() => handleEdit(currentNode)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('general.edit')}
          </button>
          
          <button
            onClick={handleImportExport}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('importExport.import')} / {t('importExport.export')}
          </button>
          
          {currentNode.id !== 'root-node' && (
            <button
              onClick={() => setShowMoveModal(true)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('node.move')}
            </button>
          )}

          {/* Сортировка */}
          <div className="flex gap-1 ml-auto">
            <Tooltip text="Сортировать по имени">
              <button
                onClick={() => setSortType(sortType === 'name' ? 'none' : 'name')}
                className={`p-2 rounded-lg transition-all border ${
                  sortType === 'name'
                    ? 'border-transparent'
                    : 'border-current hover:bg-accent/10'
                }`}
                style={{ 
                  color: 'var(--accent)',
                  backgroundColor: sortType === 'name' ? 'var(--accent)' : 'transparent'
                }}
              >
                <FaSort size={18} style={{ color: sortType === 'name' ? 'white' : 'var(--accent)' }} />
              </button>
            </Tooltip>
            <Tooltip text="Сортировать по дедлайну">
              <button
                onClick={() => setSortType(sortType === 'deadline' ? 'none' : 'deadline')}
                className={`p-2 rounded-lg transition-all border ${
                  sortType === 'deadline'
                    ? 'border-transparent'
                    : 'border-current hover:bg-accent/10'
                }`}
                style={{ 
                  color: 'var(--accent)',
                  backgroundColor: sortType === 'deadline' ? 'var(--accent)' : 'transparent'
                }}
              >
                <FiCalendar size={18} style={{ color: sortType === 'deadline' ? 'white' : 'var(--accent)' }} />
              </button>
            </Tooltip>
          </div>
        </div>
        
        {/* Контент: список детей и дедлайны */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Список детей */}
          <div className="lg:col-span-2">
            {sortedChildren.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400">{t('node.noChildren')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedChildren.map((child, index) => (
                  <NodeCard
                    key={child.id}
                    node={child}
                    index={index}
                    onNavigate={navigateToNode}
                    onMarkCompleted={handleMarkCompleted}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onTogglePriority={handleTogglePriority}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    isDragOver={dragOverNodeId === child.id}
                    draggedNode={draggedNode}
                  />
                ))}
              </div>
            )}
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
    </div>
  );
}
