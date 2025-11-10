import { useState, useCallback, useRef, useEffect } from 'react';

export interface Toast {
  id: string;
  message: string;
  undo?: () => void;
  createdAt: number;
}

let toastIdCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Очищаем все таймеры при размонтировании
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  const showToast = useCallback((message: string, undo?: () => void) => {
    const id = `toast-${toastIdCounter++}`;
    const toast: Toast = { id, message, undo, createdAt: Date.now() };
    
    setToasts(prev => [...prev, toast]);
    
    // Автоудаление через 5 секунд для toast с undo, 3 секунды для обычных
    const timeout = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timeoutsRef.current.delete(id);
    }, undo ? 5000 : 3000);
    
    timeoutsRef.current.set(id, timeout);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    // Очищаем таймер если он существует
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}

