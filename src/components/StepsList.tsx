import React from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { NodeCard } from './NodeCard';
import { Tooltip } from './Tooltip';
import { FiPlus } from 'react-icons/fi';

interface StepsListProps {
  children: Node[];
  onCreateChild: () => void;
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onEdit: (node: Node) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (id: string, priority: boolean) => void;
  onDragStart?: (node: Node) => void;
  onDragEnd?: () => void;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
  draggedNode?: Node | null;
  dragOverNodeId?: string | null;
}

export function StepsList({ 
  children, 
  onCreateChild,
  onNavigate, 
  onMarkCompleted, 
  onEdit, 
  onDelete,
  onTogglePriority,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  draggedNode,
  dragOverNodeId
}: StepsListProps) {
  if (children.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('node.steps') || 'Шаги'}
          </h2>
          <Tooltip text={t('node.createChild')}>
            <button
              onClick={onCreateChild}
              className="p-2 rounded-lg transition-all border border-transparent hover:bg-accent/10"
              style={{ color: 'var(--accent)' }}
            >
              <FiPlus size={18} style={{ color: 'var(--accent)' }} />
            </button>
          </Tooltip>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          {t('node.noChildren')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('node.steps') || 'Шаги'}
        </h2>
        <Tooltip text={t('node.createChild')}>
          <button
            onClick={onCreateChild}
            className="p-2 rounded-lg transition-all border border-transparent hover:bg-accent/10 hover:brightness-150"
            style={{ color: 'var(--accent)', backgroundColor: 'var(--accent)' }}
          >
            <FiPlus size={18} style={{ color: 'white' }} />
          </button>
        </Tooltip>
      </div>
      <div className="space-y-2">
        {children.map((child, index) => (
          <NodeCard
            key={child.id}
            node={child}
            index={index}
            onNavigate={onNavigate}
            onMarkCompleted={onMarkCompleted}
            onEdit={onEdit}
            onDelete={onDelete}
            onTogglePriority={onTogglePriority}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            isDragOver={dragOverNodeId === child.id}
            draggedNode={draggedNode}
          />
        ))}
      </div>
    </div>
  );
}

