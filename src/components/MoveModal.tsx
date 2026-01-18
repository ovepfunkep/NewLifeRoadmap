import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { getRoot, getNode } from '../db';
import { t } from '../i18n';

interface MoveModalProps {
  sourceNodeId: string;
  onMove: (sourceNodeId: string, targetNodeId: string) => void;
  onClose: () => void;
}

interface TreeNodeProps {
  node: Node;
  level: number;
  sourceNodeId: string;
  sourceNodeTree: Node | null;
  onSelect: (nodeId: string) => void;
}

// Проверка, является ли targetId потомком sourceNode
function isDescendant(sourceNode: Node, targetId: string): boolean {
  for (const child of sourceNode.children) {
    if (child.id === targetId) return true;
    if (isDescendant(child, targetId)) return true;
  }
  return false;
}

function TreeNode({ node, level, sourceNodeId, sourceNodeTree, onSelect }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<Node[]>(node.children);

  // Нельзя переместить в себя, в корневой узел, или в свой подшаг
  const canSelect = node.id !== sourceNodeId && 
                    node.id !== 'root-node' && 
                    !(sourceNodeTree && isDescendant(sourceNodeTree, node.id));

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canSelect) {
      onSelect(node.id);
    }
  };

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && node.children.length === 0) {
      // Загружаем полный узел для получения актуальных детей
      const fullNode = await getNode(node.id);
      if (fullNode) {
        setChildren(fullNode.children);
      }
    }
    setIsExpanded(!isExpanded);
  };

  // Авто-раскрытие корня
  useEffect(() => {
    if (level === 0) {
      setIsExpanded(true);
    }
  }, [level]);

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
          canSelect
            ? 'hover:bg-gray-100 dark:hover:bg-gray-700'
            : 'opacity-50 cursor-not-allowed'
        }`}
        onClick={handleSelect}
      >
        <button
          onClick={handleToggleExpand}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/10 transition-colors"
          style={{ color: 'var(--accent)' }}
        >
          {children.length > 0 ? (
            <span className="font-bold">{isExpanded ? '−' : '+'}</span>
          ) : (
            <span className="w-4" />
          )}
        </button>
        <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
          {node.title}
        </span>
        {!canSelect && (
          <span className="text-xs text-gray-400">
            {node.id === 'root-node' 
              ? '(корневая задача)' 
              : node.id === sourceNodeId 
              ? '(текущая задача)' 
              : '(свой подшаг)'}
          </span>
        )}
      </div>
      {isExpanded && (
        <div className="ml-6 border-l border-gray-200 dark:border-gray-700">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              sourceNodeId={sourceNodeId}
              sourceNodeTree={sourceNodeTree}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MoveModal({ sourceNodeId, onMove, onClose }: MoveModalProps) {
  const [rootNode, setRootNode] = useState<Node | null>(null);
  const [sourceNodeTree, setSourceNodeTree] = useState<Node | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const root = await getRoot();
      setRootNode(root);
      
      // Загружаем полное дерево исходного узла для проверки на рекурсию
      const source = await getNode(sourceNodeId);
      if (source) {
        setSourceNodeTree(source);
      }
    };
    loadData();
  }, [sourceNodeId]);

  // Обработка ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    clickStartRef.current = {
      target: e.target,
      inside: modalRef.current?.contains(e.target as unknown as globalThis.Node) || false
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (clickStartRef.current && !clickStartRef.current.inside) {
      const endedInside = modalRef.current?.contains(e.target as unknown as globalThis.Node) || false;
      if (!endedInside) {
        onClose();
      }
    }
    clickStartRef.current = null;
  };

  const handleSelect = (targetNodeId: string) => {
    onMove(sourceNodeId, targetNodeId);
    onClose();
  };

  if (!rootNode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <p className="text-gray-600 dark:text-gray-400">{t('general.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('node.moveTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {t('move.selectTarget')}
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <TreeNode
            node={rootNode}
            level={0}
            sourceNodeId={sourceNodeId}
            sourceNodeTree={sourceNodeTree}
            onSelect={handleSelect}
          />
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('general.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
