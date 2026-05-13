import type { Node } from '../../types';

export interface NodeCardProps {
  node: Node;
  index: number;
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
  isDragOver?: boolean;
  draggedNode?: Node | null;
  currentNodeId?: string;
  isBurning?: boolean;
  isMovingOut?: boolean;
}
