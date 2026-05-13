import type { Node, NodeRecurrence } from '../../types';

export interface EditorModalProps {
  node: Node | null;
  parentId: string | null;
  onSave: (node: Node) => void;
  onClose: () => void;
  initialDeadline?: Date;
  initialRecurring?: NodeRecurrence;
}
