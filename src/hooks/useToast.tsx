import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';

export interface Toast {
  id: string;
  message: string;
  subtitle?: string; // Полупрозрачный подтекст
  undo?: () => void;
  persistent?: boolean; // Не закрываемый тост
  isLoading?: boolean; // Показывать иконку загрузки
  isSuccess?: boolean; // Показывать галочку успеха
  type?: 'success' | 'warning' | 'error' | 'default'; // Категория тоста
  createdAt: number;
}

let toastIdCounter = 0;
// Глобальное состояние тостов
let globalToasts: Toast[] = [];
let globalListeners: Set<() => void> = new Set();

function getActiveSyncCount() {
  return globalToasts.filter(t => t.isLoading).length;
}

function notifyListeners() {
  globalListeners.forEach(listener => listener());
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, undo?: () => void, options?: { subtitle?: string; persistent?: boolean; isLoading?: boolean; type?: 'success' | 'warning' | 'error' | 'default' }) => string;
  updateToast: (id: string, updates: Partial<Toast>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>(globalToasts);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Синхронизируем локальное состояние с глобальным
  useEffect(() => {
    const listener = () => {
      setToasts([...globalToasts]);
    };
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  // Обработчик предупреждения при перезагрузке страницы во время синхронизации
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Не показываем предупреждение, если перезагрузка программная
      if ((window as any).__isProgrammaticReload) {
        return;
      }
      
      if (getActiveSyncCount() > 0) {
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

  const showToast = useCallback((message: string, undo?: () => void, options?: { subtitle?: string; persistent?: boolean; isLoading?: boolean; type?: 'success' | 'warning' | 'error' | 'default' }) => {
    const id = `toast-${toastIdCounter++}`;
    const toast: Toast = { 
      id, 
      message, 
      undo, 
      subtitle: options?.subtitle,
      persistent: options?.persistent,
      isLoading: options?.isLoading ?? false,
      type: options?.type || 'default',
      createdAt: Date.now() 
    };
    
    globalToasts = [...globalToasts, toast];
    notifyListeners();
    
    // Автоудаление только для не persistent тостов
    if (!options?.persistent) {
      // Автоудаление через 3.3 секунды (3с показ + 0.3с запас на анимацию выхода)
      const timeout = setTimeout(() => {
        globalToasts = globalToasts.filter(t => t.id !== id);
        notifyListeners();
        timeoutsRef.current.delete(id);
      }, 3300);
      
      timeoutsRef.current.set(id, timeout);
    }
    return id;
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    globalToasts = globalToasts.map(toast => {
      if (toast.id === id) {
        return { ...toast, ...updates };
      }
      return toast;
    });
    notifyListeners();
  }, []);

  const removeToast = useCallback((id: string) => {
    globalToasts = globalToasts.filter(t => t.id !== id);
    notifyListeners();
    
    // Очищаем таймер если он существует
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, updateToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
