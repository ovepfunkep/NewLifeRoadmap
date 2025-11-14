import React, { useState, useEffect } from 'react';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { computeProgress, getDeadlineColor, getProgressCounts } from '../utils';
import { useEffects } from '../hooks/useEffects';
import { FiEdit2, FiDownload, FiMove, FiCheck } from 'react-icons/fi';
import { Tooltip } from './Tooltip';

interface HeaderProps {
  node: Node;
  breadcrumbs: Node[];
  draggedNode?: Node | null;
  dragOverNodeId?: string | null;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
  onDragEnd?: () => void;
  onEdit?: (node: Node) => void;
  onImportExport?: () => void;
  onMove?: () => void;
  onMarkCompleted?: (id: string, completed: boolean) => void;
  currentNodeId?: string;
}

export function Header({ 
  node, 
  breadcrumbs, 
  draggedNode, 
  dragOverNodeId, 
  onDragOver, 
  onDragLeave,
  onDragEnd,
  onEdit,
  onImportExport,
  onMove,
  onMarkCompleted,
  currentNodeId
}: HeaderProps) {
  const [, navigateToNode] = useNodeNavigation();
  const t = useTranslation();
  const progress = computeProgress(node);
  const { effectsEnabled } = useEffects();
  const [isBlinking, setIsBlinking] = useState(false);
  
  // Мигание прогресс-бара при 100% - пересчитывается при изменении node
  useEffect(() => {
    const currentProgress = computeProgress(node);
    // Мигаем когда прогресс 100%, эффекты включены, и узел сам не помечен как выполненный
    if (currentProgress === 100 && effectsEnabled && !node.completed) {
      setIsBlinking(true);
    } else {
      setIsBlinking(false);
    }
  }, [node, effectsEnabled]);

  const handleBreadcrumbDragOver = (nodeId: string) => {
    // Запрещаем перетаскивание в текущий узел
    if (currentNodeId && nodeId === currentNodeId) {
      return;
    }
    if (draggedNode && draggedNode.id !== nodeId) {
      onDragOver?.(nodeId);
    }
  };

  const handleBreadcrumbMouseUp = (nodeId: string) => {
    if (draggedNode && draggedNode.id !== nodeId) {
      onDragEnd?.();
    }
  };

  const handleBreadcrumbMouseLeave = () => {
    // Не сбрасываем подсветку при уходе мышки с крошки во время drag
    // Подсветка должна оставаться пока идет drag
    if (!draggedNode) {
      // Только если не идет drag, можно сбрасывать
      onDragLeave?.();
    }
  };

  const handleBreadcrumbTouchEnd = (nodeId: string) => {
    if (draggedNode && draggedNode.id !== nodeId) {
      onDragEnd?.();
    }
  };

  return (
          <header 
            className="sticky top-0 z-50 bg-white dark:bg-gray-900 backdrop-blur-md border-b border-gray-300 dark:border-gray-800 overflow-visible"
            style={{
              // Material Design elevation dp4 для header (выше чем контейнеры)
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)'
            }}
          >
            <div className="container mx-auto px-4 py-3 relative">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Хлебные крошки */}
                  <nav className="flex items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
              {breadcrumbs.map((crumb, idx) => {
                // Запрещаем перетаскивание в текущий узел
                const isCurrentNode = currentNodeId && crumb.id === currentNodeId;
                const isDragOver = !isCurrentNode && draggedNode && dragOverNodeId === crumb.id;
                return (
                  <React.Fragment key={crumb.id}>
                    <button
                      onClick={() => navigateToNode(crumb.id)}
                      onMouseEnter={() => handleBreadcrumbDragOver(crumb.id)}
                      onMouseLeave={handleBreadcrumbMouseLeave}
                      onMouseUp={() => handleBreadcrumbMouseUp(crumb.id)}
                      onTouchEnd={() => handleBreadcrumbTouchEnd(crumb.id)}
                      data-node-id={crumb.id}
                      className="hover:text-gray-900 dark:hover:text-gray-100 truncate max-w-[200px] px-2 py-1 rounded transition-all"
                      style={{
                        ...(isDragOver ? {
                          borderColor: 'var(--accent)',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderRadius: '0.5rem',
                          transition: 'all 0.2s ease'
                        } : {
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderColor: 'transparent'
                        })
                      }}
                    >
                      {crumb.title}
                    </button>
                    {idx < breadcrumbs.length - 1 && (
                      <span className="text-gray-400">/</span>
                    )}
                  </React.Fragment>
                );
              })}
              </div>
            </nav>
            
                  {/* Заголовок, прогресс, описание */}
                  <div className="flex items-start gap-3 relative">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {node.title}
                  </h1>
                  {node.priority && (
                    <span className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded border-2" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                      {t('node.priority')}
                    </span>
                  )}
                  {node.deadline && !node.completed && (
                    <span className="flex-shrink-0 text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: getDeadlineColor(node) }}>
                      {new Date(node.deadline).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                </div>
                
                {/* Кнопки действий - aligned right */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {onMarkCompleted && node.id !== 'root-node' && (
                    <Tooltip text={node.completed ? t('node.markIncomplete') : t('node.markCompleted')}>
                      <button
                        onClick={() => onMarkCompleted(node.id, !node.completed)}
                        className={`p-2 rounded-lg transition-all border hover:brightness-150 ${
                          node.completed
                            ? 'border-transparent'
                            : 'border-current hover:bg-accent/10'
                        }`}
                        style={{ 
                          color: 'var(--accent)',
                          backgroundColor: node.completed ? 'var(--accent)' : 'transparent'
                        }}
                      >
                        <FiCheck size={18} style={{ color: node.completed ? 'white' : 'var(--accent)' }} />
                      </button>
                    </Tooltip>
                  )}
                  {onEdit && (
                    <Tooltip text={t('general.edit')}>
                      <button
                        onClick={() => onEdit(node)}
                        className="p-2 rounded-lg border border-current transition-all hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiEdit2 size={18} />
                      </button>
                    </Tooltip>
                  )}
                  {onImportExport && (
                    <Tooltip text={`${t('importExport.import')} / ${t('importExport.export')}`}>
                      <button
                        onClick={onImportExport}
                        className="p-2 rounded-lg border border-current transition-all hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiDownload size={18} />
                      </button>
                    </Tooltip>
                  )}
                  {onMove && node.id !== 'root-node' && (
                    <Tooltip text={t('node.move')}>
                      <button
                        onClick={onMove}
                        className="p-2 rounded-lg border border-current transition-all hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiMove size={18} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
              
              {/* Прогресс под названием, но выше описания - оформлен как в шагах, но длиннее */}
              {node.children.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <Tooltip text={`${getProgressCounts(node).completed} / ${getProgressCounts(node).total}`}>
                    <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden" style={{ padding: '2px' }}>
                      <div
                        className={`h-full transition-all duration-300 ${isBlinking ? 'animate-pulse' : ''}`}
                        style={{
                          width: `${progress}%`,
                          backgroundColor: progress === 100 ? 'var(--accent)' : '#9ca3af',
                          animation: isBlinking ? 'pulse 0.5s ease-in-out infinite' : undefined,
                        }}
                      />
                    </div>
                  </Tooltip>
                  <span 
                    className={`text-xs ${
                      progress === 100 
                        ? '' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                    style={{ 
                      color: progress === 100 ? 'var(--accent)' : undefined 
                    }}
                  >
                    {progress}%
                  </span>
                </div>
              )}
              
                {node.description && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
                    {node.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
