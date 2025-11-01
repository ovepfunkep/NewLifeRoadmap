import React from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { computeProgress, getDeadlineColor } from '../utils';
import { ThemeAccentControls } from './ThemeAccentControls';

interface HeaderProps {
  node: Node;
  breadcrumbs: Node[];
  draggedNode?: Node | null;
  dragOverNodeId?: string | null;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
}

export function Header({ node, breadcrumbs, draggedNode, dragOverNodeId, onDragOver, onDragLeave }: HeaderProps) {
  const [, navigateToNode] = useNodeNavigation();
  const progress = computeProgress(node);

  const handleBreadcrumbDragOver = (nodeId: string) => {
    if (draggedNode && draggedNode.id !== nodeId) {
      onDragOver?.(nodeId);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Хлебные крошки и контролы темы */}
            <nav className="flex items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
              {breadcrumbs.map((crumb, idx) => {
                const isDragOver = dragOverNodeId === crumb.id;
                return (
                  <React.Fragment key={crumb.id}>
                    <button
                      onClick={() => navigateToNode(crumb.id)}
                      onMouseEnter={() => handleBreadcrumbDragOver(crumb.id)}
                      onMouseLeave={onDragLeave}
                      className={`hover:text-gray-900 dark:hover:text-gray-100 truncate max-w-[200px] px-2 py-1 rounded transition-all ${
                        isDragOver ? 'shadow-lg ring-2 ring-offset-2' : ''
                      }`}
                      style={isDragOver ? {
                        boxShadow: `0 0 0 3px var(--accent), 0 4px 6px -1px rgba(0, 0, 0, 0.1)`,
                        transition: 'all 0.5s ease'
                      } : {}}
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
              
              {/* Контролы темы и акцента */}
              <ThemeAccentControls />
            </nav>
            
            {/* Заголовок, описание и прогресс */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {node.title}
                  </h1>
                  {node.priority && (
                    <span className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded border-2" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                      Приоритет
                    </span>
                  )}
                  {node.children.length > 0 && (
                    <span 
                      className={`flex-shrink-0 text-sm font-medium px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 ${
                        progress === 100 
                          ? '' 
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                      style={{
                        color: progress === 100 ? 'var(--accent)' : undefined
                      }}
                    >
                      {t('node.progress')}: {progress}%
                    </span>
                  )}
                  {node.deadline && !node.completed && (
                    <span className="flex-shrink-0 text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: getDeadlineColor(node) }}>
                      {new Date(node.deadline).toLocaleDateString('ru-RU')}
                    </span>
                  )}
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
    </header>
  );
}
