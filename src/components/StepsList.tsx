import { Node } from '../types';
import { t } from '../i18n';
import { NodeCard } from './NodeCard';
import { Tooltip } from './Tooltip';
import { FiPlus, FiCalendar, FiCheck } from 'react-icons/fi';
import { FaSort } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffects } from '../hooks/useEffects';

type SortType = 'none' | 'name' | 'deadline';
type FilterType = 'all' | 'completed' | 'incomplete';

interface StepsListProps {
  children: Node[];
  onCreateChild: () => void;
  onNavigate: (id: string) => void;
  onMarkCompleted: (id: string, completed: boolean) => void;
  onEdit: (node: Node) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (id: string, priority: boolean) => void;
  onMove?: (node: Node) => void;
  onDragStart?: (node: Node) => void;
  onDragEnd?: () => void;
  onDragOver?: (nodeId: string) => void;
  onDragLeave?: () => void;
  draggedNode?: Node | null;
  dragOverNodeId?: string | null;
  sortType: SortType;
  onSortChange: (sort: SortType) => void;
  filterType: FilterType;
  onFilterChange: (filter: FilterType) => void;
  currentNodeId?: string;
  animatingBurnId?: string | null;
  animatingMoveId?: string | null;
}

export function StepsList({ 
  children, 
  onCreateChild,
  onNavigate, 
  onMarkCompleted, 
  onEdit, 
  onDelete,
  onTogglePriority,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  draggedNode,
  dragOverNodeId,
  sortType,
  onSortChange,
  filterType,
  onFilterChange,
  currentNodeId,
  animatingBurnId,
  animatingMoveId
}: StepsListProps) {
  const { effectsEnabled } = useEffects();
  
  // Фильтрация
  const filteredChildren = children.filter(child => {
    if (filterType === 'all') return true;
    if (filterType === 'completed') return child.completed;
    if (filterType === 'incomplete') return !child.completed;
    return true;
  });

  // Сортировка
  const sortedChildren = [...filteredChildren].sort((a, b) => {
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
    
    // По умолчанию по order
    return (a.order ?? 0) - (b.order ?? 0);
  });
  if (children.length === 0) {
    return (
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-5"
        style={{
          // Material Design elevation dp2 для контейнера списка
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('node.steps') || 'Задачи'}
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
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 italic">
          {t('node.noChildren')}
        </p>
      </div>
    );
  }

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-5"
      style={{
        // Material Design elevation dp2 для контейнера списка
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08)'
      }}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('node.steps') || 'Задачи'}
          </h2>
          {/* Сортировки */}
          <div className="flex items-center gap-1">
            <Tooltip text={t('sort.name')}>
              <button
                onClick={() => onSortChange(sortType === 'name' ? 'none' : 'name')}
                className={`p-1.5 rounded-lg transition-all border hover:brightness-150 ${
                  sortType === 'name'
                    ? 'border-transparent'
                    : 'border-current hover:bg-accent/10'
                }`}
                style={{ 
                  color: 'var(--accent)',
                  backgroundColor: sortType === 'name' ? 'var(--accent)' : 'transparent'
                }}
              >
                <FaSort size={14} style={{ color: sortType === 'name' ? 'white' : 'var(--accent)' }} />
              </button>
            </Tooltip>
            <Tooltip text={t('sort.deadline')}>
              <button
                onClick={() => onSortChange(sortType === 'deadline' ? 'none' : 'deadline')}
                className={`p-1.5 rounded-lg transition-all border hover:brightness-150 ${
                  sortType === 'deadline'
                    ? 'border-transparent'
                    : 'border-current hover:bg-accent/10'
                }`}
                style={{ 
                  color: 'var(--accent)',
                  backgroundColor: sortType === 'deadline' ? 'var(--accent)' : 'transparent'
                }}
              >
                <FiCalendar size={14} style={{ color: sortType === 'deadline' ? 'white' : 'var(--accent)' }} />
              </button>
            </Tooltip>
          </div>
          {/* Фильтр по выполненности - одна кнопка с тремя состояниями */}
          <Tooltip text={
            filterType === 'all' ? t('filter.all') :
            filterType === 'completed' ? t('filter.completed') :
            t('filter.incomplete')
          }>
            <button
              onClick={() => {
                // Циклическое переключение: all -> completed -> incomplete -> all
                if (filterType === 'all') {
                  onFilterChange('completed');
                } else if (filterType === 'completed') {
                  onFilterChange('incomplete');
                } else {
                  onFilterChange('all');
                }
              }}
              className={`p-1.5 rounded-lg transition-all border hover:brightness-150 ${
                filterType === 'all'
                  ? 'border-current hover:bg-accent/10'
                  : 'border-transparent'
              }`}
              style={{ 
                color: 'var(--accent)',
                backgroundColor: filterType !== 'all' ? 'var(--accent)' : 'transparent'
              }}
            >
              {filterType === 'all' && (
                <FiCheck size={14} style={{ color: 'var(--accent)' }} />
              )}
              {filterType === 'completed' && (
                <FiCheck size={14} style={{ color: 'white' }} />
              )}
              {filterType === 'incomplete' && (
                <span style={{ color: 'white', fontSize: '11px', lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px' }}>✕</span>
              )}
            </button>
          </Tooltip>
        </div>
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
      <div className="space-y-3">
        <AnimatePresence initial={false} mode="popLayout">
          {sortedChildren.map((child, index) => (
            <motion.div
              key={child.id}
              layout={effectsEnabled ? "position" : false}
              initial={effectsEnabled ? { opacity: 0, scale: 0.9, y: 20 } : false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={effectsEnabled ? { opacity: 0, scale: 0.8, transition: { duration: 0.2 } } : { opacity: 0 }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 35,
                opacity: { duration: 0.2 }
              }}
            >
              <NodeCard
                node={child}
                index={index}
                onNavigate={onNavigate}
                onMarkCompleted={onMarkCompleted}
                onEdit={onEdit}
                onDelete={onDelete}
                onTogglePriority={onTogglePriority}
                onMove={onMove}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                isDragOver={dragOverNodeId === child.id && (!currentNodeId || child.id !== currentNodeId)}
                draggedNode={draggedNode}
                currentNodeId={currentNodeId}
                isBurning={animatingBurnId === child.id}
                isMovingOut={animatingMoveId === child.id}
                onCancelDelete={() => {}} // Временная заглушка, отмена в тосте
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

