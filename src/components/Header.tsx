import React, { useState, useEffect } from 'react';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { computeProgress, getDeadlineColor, getProgressCounts, formatDeadline } from '../utils';
import { useEffects } from '../hooks/useEffects';
import { FiEdit2, FiDownload, FiMove, FiCheck, FiTrash2, FiArrowUp } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Garland } from './Garland';

interface HeaderProps {
  node: Node;
  breadcrumbs: Node[];
  draggedNode?: Node | null;
  dragOverNodeId?: string | null;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
  onDragEnd?: () => void;
  onEdit?: (node: Node) => void;
  onDelete?: (id: string) => void;
  onImportExport?: () => void;
  onMove?: () => void;
  onMarkCompleted?: (id: string, completed: boolean) => void;
  onTogglePriority?: (id: string, priority: boolean) => void;
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
  onDelete,
  onImportExport,
  onMove,
  onMarkCompleted,
  onTogglePriority,
  currentNodeId
}: HeaderProps) {
  const [, navigateToNode] = useNodeNavigation();
  const t = useTranslation();
  const progress = computeProgress(node);
  const { effectsEnabled } = useEffects();
  const [isBlinking, setIsBlinking] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Track scroll for sticky header size reduction
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
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
              className={`sticky top-0 z-50 bg-white dark:bg-gray-900 backdrop-blur-md border-b overflow-visible transition-all ${
                node.priority ? 'border-b-[3px]' : 'border-gray-300 dark:border-gray-800'
              }`}
              style={{
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                borderColor: node.priority ? 'var(--accent)' : undefined,
                top: 0
              }}
            >
              <Garland />
              <div className="container mx-auto px-4 pt-6 pb-3 relative">
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
                      className="hover:text-gray-900 dark:hover:text-gray-100 truncate max-w-[200px] px-2 py-1 rounded transition-all relative"
                      style={{
                        ...(isDragOver ? {
                          color: 'var(--accent)',
                          fontWeight: 'bold',
                        } : {})
                      }}
                    >
                      {crumb.title}
                      <AnimatePresence>
                        {isDragOver && effectsEnabled && (
                          <motion.div
                            layoutId="breadcrumb-drag-highlight"
                            className="absolute inset-0 border-2 rounded-lg z-[-1]"
                            style={{ borderColor: 'var(--accent)' }}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ 
                              opacity: [0.3, 0.6, 0.3], 
                              scale: 1,
                              boxShadow: [
                                '0 0 0px var(--accent)',
                                '0 0 15px var(--accent)',
                                '0 0 0px var(--accent)'
                              ]
                            }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            transition={{ 
                              opacity: { repeat: Infinity, duration: 1 },
                              boxShadow: { repeat: Infinity, duration: 1 }
                            }}
                          />
                        )}
                      </AnimatePresence>
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
                        <div className="flex flex-col gap-1">
                          {node.deadline && !node.completed && (
                            <div>
                              <span 
                                className="text-[11px] px-2 py-1 rounded font-bold border uppercase tracking-wider whitespace-nowrap"
                                style={{
                                  borderColor: '#eab308',
                                  color: 'black',
                                  backgroundColor: '#eab308',
                                }}
                              >
                                {formatDeadline(node.deadline)}
                              </span>
                            </div>
                          )}
                          <h1 className={`text-2xl font-bold transition-all ${node.completed ? 'opacity-80' : 'text-gray-900 dark:text-gray-100'}`}
                              style={{ color: node.completed ? 'var(--accent)' : undefined }}>
                            {node.title}
                          </h1>
                        </div>
                
                {/* Кнопки действий - aligned right */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {onMarkCompleted && node.id !== 'root-node' && (
                    <Tooltip text={node.completed ? t('node.markIncomplete') : t('node.markCompleted')}>
                      <button
                        onClick={() => onMarkCompleted(node.id, !node.completed)}
                        className={`p-3 sm:p-2 rounded-lg transition-all border hover:brightness-150 ${
                          node.completed
                            ? 'border-transparent'
                            : 'border-current hover:bg-accent/10'
                        }`}
                        style={{ 
                          color: 'var(--accent)',
                          backgroundColor: node.completed ? 'var(--accent)' : 'transparent'
                        }}
                      >
                        <FiCheck size={20} className="sm:w-4 sm:h-4" style={{ color: node.completed ? 'white' : 'var(--accent)' }} />
                      </button>
                    </Tooltip>
                  )}
                  {onTogglePriority && node.id !== 'root-node' && (
                    <Tooltip text={node.priority ? t('tooltip.removePriority') : t('tooltip.priority')}>
                      <button
                        onClick={() => onTogglePriority(node.id, !node.priority)}
                        className={`p-3 sm:p-2 rounded-lg transition-all border hover:brightness-150 ${
                          node.priority
                            ? 'border-transparent'
                            : 'border-current hover:bg-accent/10'
                        }`}
                        style={{ 
                          color: 'var(--accent)',
                          backgroundColor: node.priority ? 'var(--accent)' : 'transparent'
                        }}
                      >
                        <FiArrowUp size={20} className="sm:w-4 sm:h-4" style={{ color: node.priority ? 'white' : 'var(--accent)' }} />
                      </button>
                    </Tooltip>
                  )}
                  {onEdit && (
                    <Tooltip text={t('general.edit')}>
                      <button
                        onClick={() => onEdit(node)}
                        className="p-3 sm:p-2 rounded-lg border border-current transition-all hover:bg-accent/10 hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiEdit2 size={20} className="sm:w-4 sm:h-4" />
                      </button>
                    </Tooltip>
                  )}
                  {onImportExport && (
                    <Tooltip text={`${t('importExport.import')} / ${t('importExport.export')}`}>
                      <button
                        onClick={onImportExport}
                        className="p-3 sm:p-2 rounded-lg border border-current transition-all hover:bg-accent/10 hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiDownload size={20} className="sm:w-4 sm:h-4" />
                      </button>
                    </Tooltip>
                  )}
                  {onMove && node.id !== 'root-node' && (
                    <Tooltip text={t('node.move')}>
                      <button
                        onClick={onMove}
                        className="p-3 sm:p-2 rounded-lg border border-current transition-all hover:bg-accent/10 hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiMove size={20} className="sm:w-4 sm:h-4" />
                      </button>
                    </Tooltip>
                  )}
                  {onDelete && node.id !== 'root-node' && (
                    <Tooltip text={t('general.delete')}>
                      <button
                        onClick={() => onDelete(node.id)}
                        className="p-3 sm:p-2 rounded-lg border border-red-500 text-red-500 transition-all hover:bg-red-50 dark:hover:bg-red-900/20 hover:brightness-150"
                      >
                        <FiTrash2 size={20} className="sm:w-4 sm:h-4" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
              
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
        
      {/* Прогресс бар в самом низу хедера, во всю ширину */}
      {node.children.length > 0 && (
        <div className="w-full h-6 bg-gray-100 dark:bg-gray-800 relative overflow-hidden flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
          <div
            className={`h-full transition-all duration-500 ${isBlinking ? 'animate-pulse' : ''}`}
            style={{
              width: `${progress}%`,
              backgroundColor: progress === 100 ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.3)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className={`text-xs font-normal opacity-40 ${progress > 50 ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              {getProgressCounts(node).completed} / {getProgressCounts(node).total}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
