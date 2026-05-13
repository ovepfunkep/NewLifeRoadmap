import type { Node } from '../../types';
import { getProgressCounts } from '../../utils';

type ThemeMode = 'light' | 'dark';

/** Progress strip for nodes that have child steps. */
export function NodeCardSubtaskProgress(props: {
  node: Node;
  progress: number;
  isBlinking: boolean;
  theme: ThemeMode;
}) {
  const { node, progress, isBlinking, theme } = props;
  if (node.children.length === 0) return null;

  const counts = getProgressCounts(node);

  return (
    <div
      className="relative mt-auto h-7 overflow-hidden dark:bg-gray-700/50"
      style={theme === 'light' ? { backgroundColor: 'rgba(var(--accent-rgb), 0.11)' } : undefined}
    >
      <div
        className={`h-full transition-all duration-500 ${isBlinking ? 'animate-pulse' : ''}`}
        style={{
          width: `${progress}%`,
          backgroundColor: progress === 100 ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.4)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={`text-xs font-semibold ${progress > 50 ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}
        >
          {counts.completed} / {counts.total}
        </span>
      </div>
    </div>
  );
}
