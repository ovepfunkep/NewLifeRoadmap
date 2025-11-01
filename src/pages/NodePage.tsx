import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Node } from '../types';
import { t } from '../i18n';
import { initDB, getRoot, getNode, saveNode, deleteNode } from '../db';
import { buildBreadcrumbs } from '../utils';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { useToast } from '../hooks/useToast';
import { Header } from '../components/Header';
import { NodeCard } from '../components/NodeCard';
import { DeadlineList } from '../components/DeadlineList';
import { EditorModal } from '../components/EditorModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { ToastList } from '../components/ToastList';
import { generateId } from '../utils';
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
  const [isDragging, setIsDragging] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  // Сохраняем стабильный список во время drag
  const [stableChildren, setStableChildren] = useState<Node[]>([]);

  // Вычисляем отсортированных детей (без использования isDragging в зависимостях useMemo)
  const computeSortedChildren = (children: Node[]): Node[] => {
    // Разделяем на приоритетные и обычные
    const priority = children.filter(c => c.priority);
    const normal = children.filter(c => !c.priority);

    // Сортируем приоритетные по order, затем обычные по order
    const sortedPriority = [...priority].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const sortedNormal = [...normal].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let result = [...sortedPriority, ...sortedNormal];

    // Применяем дополнительную сортировку (только если не идёт drag)
    if (!isDragging && sortType === 'name') {
      result = result.sort((a, b) => a.title.localeCompare(b.title));
      // Но приоритетные остаются сверху
      const priority2 = result.filter(c => c.priority);
      const normal2 = result.filter(c => !c.priority);
      result = [...priority2, ...normal2];
    } else if (!isDragging && sortType === 'deadline') {
      result = result.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
      });
      // Приоритетные остаются сверху
      const priority2 = result.filter(c => c.priority);
      const normal2 = result.filter(c => !c.priority);
      result = [...priority2, ...normal2];
    }

    return result;
  };

  // Мемоизированный список (зависит только от children и sortType)
  // Создаём строку для отслеживания изменений детей
  const childrenKey = currentNode ? JSON.stringify(currentNode.children.map(c => c.id)) : '';
  
  const baseSortedChildren = useMemo(() => {
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
  }, [currentNode, childrenKey, sortType]);

  // Используем стабильный список во время drag, иначе базовый
  const sortedChildren = (isDragging && stableChildren.length > 0) 
    ? stableChildren 
    : baseSortedChildren;

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
        showToast(t('general.loading'));
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

  const handleDragEnd = async (result: DropResult) => {
    if (!currentNode || !result.destination) {
      setIsDragging(false);
      setStableChildren([]);
      return;
    }
    if (result.source.index === result.destination.index) {
      setIsDragging(false);
      setStableChildren([]);
      return;
    }

    // Используем стабильный список для определения элементов
    const sourceItem = stableChildren[result.source.index];
    const destItem = stableChildren[result.destination.index];

    // Получаем исходный порядок из currentNode
    const originalChildren = [...currentNode.children];
    const sourceOriginalIndex = originalChildren.findIndex(c => c.id === sourceItem.id);
    
    // Перемещаем элемент
    const reordered = [...originalChildren];
    const [movedItem] = reordered.splice(sourceOriginalIndex, 1);
    
    // Вычисляем целевой индекс в исходном списке
    const destOriginalIndex = originalChildren.findIndex(c => c.id === destItem.id);
    // Правильно вычисляем индекс вставки
    const insertIndex = sourceOriginalIndex < destOriginalIndex 
      ? destOriginalIndex 
      : destOriginalIndex + 1;
    reordered.splice(insertIndex, 0, movedItem);

    // Обновляем order для всех узлов
    const updatedChildren = reordered.map((child, index) => ({
      ...child,
      order: index,
      updatedAt: new Date().toISOString(),
    }));

    // Сохраняем все узлы
    for (const child of updatedChildren) {
      await saveNode(child);
    }

    // Обновляем родителя
    const updatedParent: Node = {
      ...currentNode,
      children: updatedChildren,
      updatedAt: new Date().toISOString(),
    };
    await saveNode(updatedParent);

    setIsDragging(false);
    setStableChildren([]);
    
    const reloaded = await getNode(currentNode.id);
    if (reloaded) {
      setCurrentNode(reloaded);
    }
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
        <p className="text-gray-600 dark:text-gray-400">Узел не найден</p>
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
              <DragDropContext 
                onDragStart={(start) => {
                  // КРИТИЧНО: Фиксируем список ДО начала drag - глубокое копирование
                  const frozenList = baseSortedChildren.map(child => ({ ...child }));
                  setStableChildren(frozenList);
                  setIsDragging(true);
                }}
                onDragEnd={handleDragEnd}
              >
                <Droppable droppableId="children">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {sortedChildren.map((child, index) => (
                        <Draggable key={child.id} draggableId={child.id} index={index}>
                          {(provided, snapshot) => (
                            <NodeCard
                              node={child}
                              index={index}
                              onNavigate={navigateToNode}
                              onMarkCompleted={handleMarkCompleted}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              onTogglePriority={handleTogglePriority}
                              isDragging={snapshot.isDragging}
                              dragHandleProps={provided.dragHandleProps}
                              draggableProps={{
                                ref: provided.innerRef,
                                ...provided.draggableProps
                              }}
                            />
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
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
      
      {/* Тосты */}
      <ToastList toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
