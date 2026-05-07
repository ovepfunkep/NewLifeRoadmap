import React, { useState, useEffect } from 'react';
import { Node } from '../types';
import { useTranslation } from '../i18n';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { computeProgress, getProgressCounts, formatDeadline } from '../utils';
import { useEffects } from '../hooks/useEffects';
import { FiEdit2, FiDownload, FiMove, FiCheck, FiTrash2, FiArrowUp, FiBarChart2, FiMoreVertical } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Garland } from './Garland';
import { SpringTrees } from './SpringTrees';
import { AMBIENT_SEASON } from '../config/ambientSeason';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionDurations, motionTransitions } from '../config/motion';
import { MobileBottomSheet } from './MobileBottomSheet';

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
  onOpenDashboard?: () => void;
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
  onOpenDashboard,
  onMarkCompleted,
  onTogglePriority,
  currentNodeId
}: HeaderProps) {
  const [, navigateToNode] = useNodeNavigation();
  const t = useTranslation();
  const progress = computeProgress(node);
  const { effectsEnabled } = useEffects();
  const { allowEssentialMotion } = useMotionPreferences();
  const [isBlinking, setIsBlinking] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const showBreadcrumbs = node.id !== 'root-node';

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setShowActionsSheet(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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

  const runMobileAction = (action: () => void) => {
    action();
    setShowActionsSheet(false);
  };

    return (
            <header 
              className="sticky top-0 z-50 overflow-visible border-b border-slate-200 bg-white/90 backdrop-blur-md transition-all dark:border-gray-800 dark:bg-gray-900/85"
              style={{
                top: 0
              }}
            >
              {AMBIENT_SEASON === 'winter' && <Garland />}
              {AMBIENT_SEASON === 'spring' && !isMobile && <SpringTrees />}
              <div className="container relative mx-auto w-full max-w-full pb-6 pt-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Хлебные крошки */}
                  {showBreadcrumbs && (
                  <nav className="mb-2 flex flex-wrap items-center justify-between gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex flex-wrap items-center gap-1">
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
                      className="relative max-w-[200px] truncate rounded px-1 py-1 transition-all hover:text-gray-900 dark:hover:text-gray-100"
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
                      <span className="px-0.5 text-gray-400">/</span>
                    )}
                  </React.Fragment>
                );
              })}
              </div>
            </nav>
                  )}
            
                  {/* Заголовок, прогресс, описание */}
                  <div className="flex items-start gap-3 relative">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-start justify-between gap-2">
                            <motion.h1
                                key={node.id}
                                className={`min-w-0 flex-1 text-3xl font-bold leading-tight transition-all md:text-2xl ${node.completed ? 'opacity-80' : 'text-gray-900 dark:text-gray-100'}`}
                                style={{ color: node.completed ? 'var(--accent)' : undefined }}
                                initial={allowEssentialMotion ? { opacity: 0, y: 8 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={allowEssentialMotion ? motionTransitions.fade : { duration: motionDurations.fast }}
                            >
                              {node.title}
                            </motion.h1>

                            {isMobile && (
                              <div className="md:hidden flex flex-shrink-0 items-start gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowActionsSheet(true)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg border border-current transition-all hover:bg-accent/10"
                                  style={{ color: 'var(--accent)' }}
                                  aria-label="Open actions menu"
                                >
                                  <FiMoreVertical size={15} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                <div className="hidden flex-shrink-0 items-center gap-1 sm:gap-2 md:flex">
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
                  {onOpenDashboard && (
                    <Tooltip text={t('dashboard.open')}>
                      <button
                        onClick={onOpenDashboard}
                        className="p-3 sm:p-2 rounded-lg border border-current transition-all hover:bg-accent/10 hover:brightness-150"
                        style={{ color: 'var(--accent)' }}
                      >
                        <FiBarChart2 size={20} className="sm:w-4 sm:h-4" />
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
                {node.deadline && !node.completed && (
                  <div className={`${node.description ? 'mt-2' : 'mt-1'}`}>
                    <span 
                      className="whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
                      style={{
                        borderColor: '#f97316',
                        color: 'white',
                        backgroundColor: '#f97316',
                      }}
                    >
                      {formatDeadline(node.deadline, node.deadlineEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MobileBottomSheet
        isOpen={showActionsSheet && isMobile}
        onClose={() => setShowActionsSheet(false)}
      >
        <div className="space-y-3">
          {onMarkCompleted && node.id !== 'root-node' && (
            <button
              type="button"
              onClick={() => onMarkCompleted(node.id, !node.completed)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
              style={{
                color: node.completed ? 'white' : 'var(--accent)',
                backgroundColor: node.completed ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.08)',
              }}
            >
              <FiCheck size={16} />
              <span className="flex-1 text-left">{node.completed ? t('node.markIncomplete') : t('node.markCompleted')}</span>
              {node.completed && <FiCheck size={14} />}
            </button>
          )}
          {onTogglePriority && node.id !== 'root-node' && (
            <button
              type="button"
              onClick={() => onTogglePriority(node.id, !node.priority)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
              style={{
                color: node.priority ? 'white' : 'var(--accent)',
                backgroundColor: node.priority ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.08)',
              }}
            >
              <FiArrowUp size={16} />
              <span className="flex-1 text-left">{node.priority ? t('tooltip.removePriority') : t('tooltip.priority')}</span>
            </button>
          )}
          {((onMarkCompleted && node.id !== 'root-node') || (onTogglePriority && node.id !== 'root-node')) && (
            <div className="mb-1 h-px bg-gray-200 dark:bg-gray-700" />
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => runMobileAction(() => onEdit(node))}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
              style={{ color: 'var(--accent)' }}
            >
              <FiEdit2 size={16} />
              <span className="flex-1 text-left">{t('general.edit')}</span>
            </button>
          )}
          {onImportExport && (
            <button
              type="button"
              onClick={() => runMobileAction(onImportExport)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
              style={{ color: 'var(--accent)' }}
            >
              <FiDownload size={16} />
              <span className="flex-1 text-left">{`${t('importExport.import')} / ${t('importExport.export')}`}</span>
            </button>
          )}
          {onMove && node.id !== 'root-node' && (
            <button
              type="button"
              onClick={() => runMobileAction(onMove)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
              style={{ color: 'var(--accent)' }}
            >
              <FiMove size={16} />
              <span className="flex-1 text-left">{t('node.move')}</span>
            </button>
          )}
          {onDelete && node.id !== 'root-node' && (
            <button
              type="button"
              onClick={() => runMobileAction(() => onDelete(node.id))}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-500"
            >
              <FiTrash2 size={16} />
              <span className="flex-1 text-left">{t('general.delete')}</span>
            </button>
          )}
        </div>
      </MobileBottomSheet>
        
      {/* Прогресс бар в самом низу хедера, во всю ширину */}
      {node.children.length > 0 && (
        <div className="w-full h-6 bg-gray-100 dark:bg-gray-800 relative overflow-hidden flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
          <motion.div
            className={`h-full transition-all duration-500 ${isBlinking ? 'animate-pulse' : ''}`}
            animate={{ width: `${progress}%` }}
            transition={
              allowEssentialMotion
                ? { duration: motionDurations.slow, ease: motionTransitions.fade.ease }
                : { duration: motionDurations.fast }
            }
            style={{
              backgroundColor: progress === 100 ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.3)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              {getProgressCounts(node).completed} / {getProgressCounts(node).total}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
