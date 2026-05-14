import { useEffect, useRef, useState } from 'react';
import type { Node } from '../types';
import { Z_MODAL } from '../config/zLayers';
import type { WeeklyBackupFileV1 } from '../utils/weeklyLocalBackup';

/** Плоский список → дерево для превью (как в SyncConflictDialog). */
function buildTreeFromFlatList(nodes: Node[]): Node | null {
  const nodeMap = new Map<string, Node>();
  nodes.forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [] });
  });
  let root: Node | null = null;
  nodes.forEach((node) => {
    const nodeInMap = nodeMap.get(node.id)!;
    if (!node.parentId || node.id === 'root-node' || !nodeMap.has(node.parentId)) {
      if (!root || node.id === 'root-node') root = nodeInMap;
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) parent.children.push(nodeInMap);
    }
  });
  return root;
}

function PreviewRow({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = node.children || [];
  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 rounded-lg py-1.5 px-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100/80 dark:hover:bg-gray-700/50"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            className="w-5 shrink-0 text-center text-xs font-bold text-accent"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? '−' : '+'}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </div>
      {open &&
        kids.map((ch) => (
          <PreviewRow key={ch.id} node={ch} depth={depth + 1} />
        ))}
    </div>
  );
}

interface WeeklyBackupRestoreDialogProps {
  backup: WeeklyBackupFileV1;
  open: boolean;
  isWorking: boolean;
  onClose: () => void;
  onConfirmRestore: () => void;
  title: string;
  intro: string;
  previewTitle: string;
  cancelLabel: string;
  confirmLabel: string;
}

export function WeeklyBackupRestoreDialog({
  backup,
  open,
  isWorking,
  onClose,
  onConfirmRestore,
  title,
  intro,
  previewTitle,
  cancelLabel,
  confirmLabel,
}: WeeklyBackupRestoreDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);
  const [root, setRoot] = useState<Node | null>(null);

  useEffect(() => {
    if (!open) return;
    const flat = backup.nodes.map((n) => ({ ...n, children: [] as Node[] }));
    setRoot(buildTreeFromFlatList(flat));
  }, [open, backup]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
      style={{ zIndex: Z_MODAL }}
      onMouseDown={(e) => {
        clickStartRef.current = {
          target: e.target,
          inside: modalRef.current?.contains(e.target as HTMLElement) || false,
        };
      }}
      onClick={(e) => {
        if (
          clickStartRef.current &&
          !clickStartRef.current.inside &&
          !modalRef.current?.contains(e.target as HTMLElement)
        ) {
          if (!isWorking) onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800 lg:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 bg-accent/5 p-6 dark:border-gray-700">
          <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100" style={{ color: 'var(--accent)' }}>
            {title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">{intro}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {new Date(backup.exportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">{previewTitle}</h3>
          <div className="custom-scrollbar max-h-[min(50vh,360px)] overflow-y-auto rounded-xl bg-gray-50 p-3 shadow-inner dark:bg-gray-900/50">
            {root ? <PreviewRow node={root} depth={0} /> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/30 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isWorking}
            onClick={onClose}
            className="rounded-xl px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isWorking}
            onClick={onConfirmRestore}
            className="rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
