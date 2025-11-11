import { useState, useCallback, useRef, useEffect } from 'react';

export interface Toast {
  id: string;
  message: string;
  subtitle?: string; // Полупрозрачный подтекст
  undo?: () => void;
  persistent?: boolean; // Не закрываемый тост
  isLoading?: boolean; // Показывать иконку загрузки
  isSuccess?: boolean; // Показывать галочку успеха
  createdAt: number;
}

let toastIdCounter = 0;
// Глобальный счетчик активных синхронизаций для предупреждения при перезагрузке
let activeSyncCount = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Обработчик предупреждения при перезагрузке страницы во время синхронизации
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSyncCount > 0) {
        e.preventDefault();
        e.returnValue = ''; // Chrome требует установить returnValue
        return ''; // Для старых браузеров
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Очищаем все таймеры при размонтировании
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  const showToast = useCallback((message: string, undo?: () => void, options?: { subtitle?: string; persistent?: boolean; isLoading?: boolean }) => {
    const id = `toast-${toastIdCounter++}`;
    const toast: Toast = { 
      id, 
      message, 
      undo, 
      subtitle: options?.subtitle,
      persistent: options?.persistent,
      isLoading: options?.isLoading ?? false,
      createdAt: Date.now() 
    };
    
    setToasts(prev => [...prev, toast]);
    
    // Увеличиваем счетчик активных синхронизаций
    if (options?.isLoading) {
      activeSyncCount++;
    }
    
    // Автоудаление только для не persistent тостов
    if (!options?.persistent) {
      // Автоудаление через 5 секунд для toast с undo, 3 секунды для обычных
      const timeout = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timeoutsRef.current.delete(id);
      }, undo ? 5000 : 3000);
      
      timeoutsRef.current.set(id, timeout);
    }
    return id;
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts(prev => prev.map(toast => {
      if (toast.id === id) {
        // Уменьшаем счетчик если синхронизация завершена
        if (toast.isLoading && updates.isLoading === false) {
          activeSyncCount = Math.max(0, activeSyncCount - 1);
        }
        return { ...toast, ...updates };
      }
      return toast;
    }));
  }, []);

  const removeToast = useCallback((id: string) => {
    // Уменьшаем счетчик если удаляем тост с активной синхронизацией
    setToasts(prev => {
      const toast = prev.find(t => t.id === id);
      if (toast?.isLoading) {
        activeSyncCount = Math.max(0, activeSyncCount - 1);
      }
      return prev.filter(t => t.id !== id);
    });
    
    // Очищаем таймер если он существует
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  return { toasts, showToast, updateToast, removeToast };
}

