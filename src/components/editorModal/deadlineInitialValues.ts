import type { Node, NodeRecurrence } from '../../types';

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getInitialDeadlineDate(
  node: Node | null,
  initialDeadline: Date | undefined,
  initialRecurring: NodeRecurrence | undefined
): string {
  if (!node && initialRecurring) {
    return '';
  }
  if (node?.deadline) {
    return formatDateForInput(new Date(node.deadline));
  }
  if (initialDeadline) {
    return formatDateForInput(initialDeadline);
  }
  return '';
}

export function getInitialDeadlineTime(
  node: Node | null,
  initialDeadline: Date | undefined,
  initialRecurring: NodeRecurrence | undefined
): string {
  if (!node && initialRecurring) {
    return '';
  }
  if (node?.deadline) {
    const date = new Date(node.deadline);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (hours === 0 && minutes === 0) {
      return '';
    }
    return formatTimeForInput(date);
  }
  if (initialDeadline) {
    return '12:00';
  }
  return '';
}

export function getInitialDeadlineEndTime(
  node: Node | null,
  initialRecurring: NodeRecurrence | undefined
): string {
  if (!node && initialRecurring) {
    return '';
  }
  if (node?.deadlineEnd) {
    const date = new Date(node.deadlineEnd);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (hours === 0 && minutes === 0) {
      return '';
    }
    return formatTimeForInput(date);
  }
  return '';
}
