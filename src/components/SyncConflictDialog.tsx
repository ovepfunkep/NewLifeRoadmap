import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { SyncDiff, compareNodes, isSignificantNodeDiff } from '../utils/syncCompare';

interface SyncConflictDialogProps {
  localNodes: Node[];
  cloudNodes: Node[];
  onChooseLocal: () => void;
  onChooseCloud: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

/**
 * Построить дерево из плоского списка узлов
 */
function buildTreeFromFlatList(nodes: Node[]): Node | null {
  const nodeMap = new Map<string, Node>();
  nodes.forEach(node => nodeMap.set(node.id, { ...node, children: [] }));

  let root: Node | null = null;
  nodes.forEach(node => {
    const nodeInMap = nodeMap.get(node.id)!;
    if (!node.parentId || node.id === 'root-node') {
      if (!root || node.id === 'root-node') root = nodeInMap;
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent && !parent.children.some(c => c.id === node.id)) {
        parent.children.push(nodeInMap);
      }
    }
  });
  return root;
}

interface TreeNodeProps {
  node: Node;
  level: number;
  diff: SyncDiff;
  source: 'local' | 'cloud';
  expandedNodes: Set<string>;
  toggleExpand: (nodeId: string) => void;
}

function TreeNode({ node, level, diff, source, expandedNodes, toggleExpand }: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.id);
  const isLocalOnly = diff.localOnly.some(n => n.id === node.id);
  const isCloudOnly = diff.cloudOnly.some(n => n.id === node.id);
  const isDifferent = diff.different.find(d => d.nodeId === node.id);
  const isDeleted = !!node.deletedAt;

  const hasDiffInSubtree = (n: Node): boolean => {
    const localOnly = diff.localOnly.some(item => item.id === n.id && !item.deletedAt);
    const cloudOnly = diff.cloudOnly.some(item => item.id === n.id && !item.deletedAt);
    const change = diff.different.find(item => item.nodeId === n.id);
    const isChanged = change ? isSignificantNodeDiff(change.local, change.cloud) : false;
    
    if (localOnly || cloudOnly || isChanged) return true;
    return (n.children || []).some(child => hasDiffInSubtree(child));
  };

  if (!hasDiffInSubtree(node)) return null;

  const visibleChildren = (node.children || []).filter(child => hasDiffInSubtree(child));

  let badge = null;
  if (isDeleted) {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">Удалено</span>;
  } else if (isLocalOnly && source === 'local') {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">Новое</span>;
  } else if (isCloudOnly && source === 'cloud') {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">Новое</span>;
  } else if (isDifferent && isSignificantNodeDiff(isDifferent.local, isDifferent.cloud)) {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300">Изменён</span>;
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors hover:bg-accent/5 group"
        onClick={() => toggleExpand(node.id)}
      >
        <div
          className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-accent/10 transition-colors font-bold text-xs"
          style={{ color: 'var(--accent)' }}
        >
          {visibleChildren.length > 0 ? (isExpanded ? '−' : '+') : <span className="w-4" />}
        </div>
        <span className={`flex-1 text-sm truncate group-hover:text-accent transition-colors ${isDeleted ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
          {node.title}
        </span>
        {badge}
      </div>
      {isExpanded && visibleChildren.length > 0 && (
        <div className="ml-5 border-l border-gray-200 dark:border-gray-700">
          {visibleChildren.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              diff={diff}
              source={source}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SyncConflictDialog({
  localNodes,
  cloudNodes,
  onChooseLocal,
  onChooseCloud,
  onMerge,
  onCancel,
}: SyncConflictDialogProps) {
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [localRoot, setLocalRoot] = useState<Node | null>(null);
  const [cloudRoot, setCloudRoot] = useState<Node | null>(null);
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root-node']));
  const modalRef = useRef<HTMLDivElement>(null);
  const localScrollRef = useRef<HTMLDivElement>(null);
  const cloudScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef<boolean>(false);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const calculateDiff = () => {
      const localFlat = localNodes.map(n => ({ ...n, children: [] }));
      const cloudFlat = cloudNodes.map(n => ({ ...n, children: [] }));
      const comparison = compareNodes(localFlat, cloudFlat);
      setDiff(comparison);

      setLocalRoot(buildTreeFromFlatList(localNodes));
      setCloudRoot(buildTreeFromFlatList(cloudNodes));
      
      const autoExpand = new Set<string>(['root-node']);
      const findAndExpandParents = (nodeId: string | null) => {
        let curr = nodeId;
        while (curr) {
          autoExpand.add(curr);
          const p = localNodes.find(x => x.id === curr) || cloudNodes.find(x => x.id === curr);
          curr = p?.parentId || null;
        }
      };

      comparison.localOnly.forEach(n => !n.deletedAt && findAndExpandParents(n.parentId));
      comparison.cloudOnly.forEach(n => !n.deletedAt && findAndExpandParents(n.parentId));
      comparison.different.forEach(d => isSignificantNodeDiff(d.local, d.cloud) && findAndExpandParents(d.local.id));
      setExpandedNodes(autoExpand);
    };
    calculateDiff();
  }, [localNodes, cloudNodes]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleScroll = (source: 'local' | 'cloud') => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    const sourceEl = source === 'local' ? localScrollRef.current : cloudScrollRef.current;
    const targetEl = source === 'local' ? cloudScrollRef.current : localScrollRef.current;
    if (sourceEl && targetEl) targetEl.scrollTop = sourceEl.scrollTop;
    setTimeout(() => { isScrollingRef.current = false; }, 20);
  };

  if (!diff || !localRoot || !cloudRoot) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onMouseDown={(e) => {
        clickStartRef.current = {
          target: e.target,
          inside: modalRef.current?.contains(e.target as any) || false
        };
      }}
      onClick={(e) => {
        if (clickStartRef.current && !clickStartRef.current.inside && !modalRef.current?.contains(e.target as any)) {
          onCancel();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-accent/5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1" style={{ color: 'var(--accent)' }}>
            Обнаружены различия данных
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Отображаются только ветки с расхождениями. Выберите способ синхронизации.
          </p>
        </div>

        {isMobile && (
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => setActiveTab('local')} className={`flex-1 py-3 text-xs font-bold ${activeTab === 'local' ? 'text-accent border-b-2 border-accent' : 'text-gray-500'}`}>На устройстве</button>
            <button onClick={() => setActiveTab('cloud')} className={`flex-1 py-3 text-xs font-bold ${activeTab === 'cloud' ? 'text-accent border-b-2 border-accent' : 'text-gray-500'}`}>В облаке</button>
          </div>
        )}

        <div className="flex-1 p-6 overflow-hidden flex flex-col min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-0">
            {(!isMobile || activeTab === 'local') && (
              <div className="flex flex-col h-full min-h-0">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">На устройстве</h3>
                <div ref={localScrollRef} onScroll={() => handleScroll('local')} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/50 flex-1 overflow-y-auto custom-scrollbar">
                  <TreeNode node={localRoot} level={0} diff={diff} source="local" expandedNodes={expandedNodes} toggleExpand={toggleExpand} />
                </div>
              </div>
            )}
            {(!isMobile || activeTab === 'cloud') && (
              <div className="flex flex-col h-full min-h-0">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">В облаке</h3>
                <div ref={cloudScrollRef} onScroll={() => handleScroll('cloud')} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/50 flex-1 overflow-y-auto custom-scrollbar">
                  <TreeNode node={cloudRoot} level={0} diff={diff} source="cloud" expandedNodes={expandedNodes} toggleExpand={toggleExpand} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onMerge} className="w-full sm:w-auto px-8 py-3 rounded-xl bg-accent text-white font-bold shadow-lg shadow-accent/20 hover:brightness-110 active:scale-95 transition-all text-sm">
              Объединить (Рекомендуется)
            </button>
            <button onClick={onChooseLocal} className="w-full sm:w-auto px-6 py-3 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all text-sm">
              Оставить локальные
            </button>
            <button onClick={onChooseCloud} className="w-full sm:w-auto px-6 py-3 rounded-xl border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 font-bold hover:bg-green-50 dark:hover:bg-green-900/20 active:scale-95 transition-all text-sm">
              Взять всё из облака
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
