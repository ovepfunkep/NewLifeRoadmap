import React from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { computeProgress } from '../utils';
import { ThemeAccentControls } from './ThemeAccentControls';

interface HeaderProps {
  node: Node;
  breadcrumbs: Node[];
}

export function Header({ node, breadcrumbs }: HeaderProps) {
  const [, navigateToNode] = useNodeNavigation();
  const progress = computeProgress(node);

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Хлебные крошки */}
            <nav className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2 flex-wrap">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <button
                    onClick={() => navigateToNode(crumb.id)}
                    className="hover:text-gray-900 dark:hover:text-gray-100 truncate max-w-[200px]"
                  >
                    {crumb.title}
                  </button>
                  {idx < breadcrumbs.length - 1 && (
                    <span className="text-gray-400">/</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
            
            {/* Заголовок, описание и прогресс */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                    {node.title}
                  </h1>
                  {node.priority && (
                    <span className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded border-2" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                      Приоритет
                    </span>
                  )}
                  {node.children.length > 0 && (
                    <span className="flex-shrink-0 text-sm font-medium px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {t('node.progress')}: {progress}%
                    </span>
                  )}
                </div>
                {node.description && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {node.description}
                  </p>
                )}
                {node.deadline && !node.completed && (
                  <span className="mt-1 inline-block text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
                    {new Date(node.deadline).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Контролы темы и акцента */}
          <ThemeAccentControls />
        </div>
      </div>
    </header>
  );
}

