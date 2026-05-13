import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { getRoot, getNode } from '../db';
import { t } from '../i18n';
import { Z_MODAL_HIGH } from '../config/zLayers';

interface ParentPickerModalProps {
  onSelectParent: (parentId: string) => void;
  onClose: () => void;
}

interface TreeRowProps {
  node: Node;
  level: number;
  onSelect: (nodeId: string) => void;
}

function TreeRow({ node, level, onSelect }: TreeRowProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const [children, setChildren] = useState<Node[]>(() =>
    (node.children || []).filter(c => !c.deletedAt)
  );

  useEffect(() => {
    const activeChildren = (node.children || []).filter(c => !c.deletedAt);
    setChildren(activeChildren);

    if (node.id === 'root-node' && activeChildren.length === 0) {
      getNode(node.id).then(fullNode => {
        if (fullNode) {
          setChildren(fullNode.children.filter(c => !c.deletedAt));
        }
      });
    }
  }, [node.children, node.id]);

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && children.length === 0) {
      const fullNode = await getNode(node.id);
      if (fullNode) {
        setChildren(fullNode.children.filter(c => !c.deletedAt));
      }
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={handleSelect}
      >
        <div
          onClick={handleToggleExpand}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/10 transition-colors cursor-pointer"
          style={{ color: 'var(--accent)' }}
        >
          {children.length > 0 ? (
            <span className="font-bold">{isExpanded ? '−' : '+'}</span>
          ) : (
            <span className="w-4" />
          )}
        </div>
        <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
          {node.title}
        </span>
        {node.id === 'root-node' && (
          <span className="text-xs text-accent opacity-70 font-medium shrink-0">
            {t('editor.pickParentRootHint')}
          </span>
        )}
      </div>
      {isExpanded && children.length > 0 && (
        <div className="ml-6 border-l border-gray-200 dark:border-gray-700">
          {children.map((child) => (
            <TreeRow key={child.id} node={child} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ParentPickerModal({ onSelectParent, onClose }: ParentPickerModalProps) {
  const [rootNode, setRootNode] = useState<Node | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);

  useEffect(() => {
    getRoot().then(setRootNode);
  }, []);

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
    onSelectParent(targetNodeId);
    onClose();
  };

  if (!rootNode) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        style={{ zIndex: Z_MODAL_HIGH }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 lg:rounded-xl">
          <p className="text-gray-600 dark:text-gray-400">{t('general.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: Z_MODAL_HIGH }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col mx-4 lg:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('editor.pickParentTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {t('editor.pickParentSubtitle')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <TreeRow node={rootNode} level={0} onSelect={handleSelect} />
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
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
