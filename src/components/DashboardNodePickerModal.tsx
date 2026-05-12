import { useEffect, useRef, useState } from 'react';
import { getNode, getRoot } from '../db';
import { useTranslation } from '../i18n';
import { Node } from '../types';
import { Z_MODAL } from '../config/zLayers';

interface DashboardNodePickerModalProps {
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

interface TreeNodeProps {
  node: Node;
  level: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function activeChildren(node: Node): Node[] {
  return (node.children || []).filter(child => !child.deletedAt);
}

function TreeNode({ node, level, selectedNodeId, onSelectNode }: TreeNodeProps) {
  const t = useTranslation();
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const [children, setChildren] = useState<Node[]>(() => activeChildren(node));
  const isLeaf = children.length === 0;
  const isCurrent = node.id === selectedNodeId;
  const canSelect = !isLeaf;

  useEffect(() => {
    const visibleChildren = activeChildren(node);
    setChildren(visibleChildren);
    if (node.id === 'root-node' && visibleChildren.length === 0) {
      getNode(node.id).then(fullNode => {
        if (!fullNode) return;
        setChildren(activeChildren(fullNode));
      });
    }
  }, [node.children, node.id]);

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && children.length === 0) {
      const fullNode = await getNode(node.id);
      if (fullNode) {
        setChildren(activeChildren(fullNode));
      }
    }
    setIsExpanded(prev => !prev);
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canSelect) return;
    onSelectNode(node.id);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleSelect}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
          canSelect
            ? 'hover:bg-gray-100 dark:hover:bg-gray-700'
            : 'opacity-60 cursor-not-allowed'
        } ${isCurrent ? 'ring-1 ring-accent/50 bg-accent/10' : ''}`}
      >
        <span
          onClick={handleToggleExpand}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold hover:bg-accent/10"
          style={{ color: 'var(--accent)' }}
        >
          {children.length > 0 ? (isExpanded ? '−' : '+') : <span className="w-4" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
          {node.title}
        </span>
        {isCurrent && (
          <span className="shrink-0 text-xs text-accent opacity-80">{t('dashboard.pickerCurrent')}</span>
        )}
        {!canSelect && (
          <span className="shrink-0 text-xs text-gray-400">{t('dashboard.pickerLeaf')}</span>
        )}
        {node.id === 'root-node' && (
          <span className="shrink-0 text-xs text-accent opacity-70">{t('dashboard.pickerRootHint')}</span>
        )}
      </button>
      {isExpanded && children.length > 0 && (
        <div className="ml-6 border-l border-gray-200 dark:border-gray-700">
          {children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardNodePickerModal({ selectedNodeId, onSelectNode, onClose }: DashboardNodePickerModalProps) {
  const t = useTranslation();
  const [rootNode, setRootNode] = useState<Node | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ inside: boolean } | null>(null);

  useEffect(() => {
    getRoot().then(setRootNode);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    clickStartRef.current = {
      inside: modalRef.current?.contains(e.target as globalThis.Node) || false,
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!clickStartRef.current?.inside) {
      const endedInside = modalRef.current?.contains(e.target as globalThis.Node) || false;
      if (!endedInside) onClose();
    }
    clickStartRef.current = null;
  };

  const handleSelect = (nodeId: string) => {
    onSelectNode(nodeId);
    onClose();
  };

  if (!rootNode) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ zIndex: Z_MODAL }}>
        <div className="rounded-lg bg-white p-6 dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-400">{t('general.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: Z_MODAL }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 p-6 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('dashboard.pickerTitle')}</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('dashboard.pickerSubtitle')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TreeNode node={rootNode} level={0} selectedNodeId={selectedNodeId} onSelectNode={handleSelect} />
        </div>
        <div className="flex justify-end border-t border-gray-200 p-6 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200/90 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600/90"
          >
            {t('general.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
