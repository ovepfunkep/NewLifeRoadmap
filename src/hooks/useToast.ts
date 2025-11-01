import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  message: string;
  undo?: () => void;
  createdAt: number;
}

let toastIdCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    const id = `toast-${toastIdCounter++}`;
    const toast: Toast = { id, message, undo, createdAt: Date.now() };
    
    setToasts(prev => [...prev, toast]);
    
    // Автоудаление через 5 секунд для toast с undo, 3 секунды для обычных
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, undo ? 5000 : 3000);
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}

