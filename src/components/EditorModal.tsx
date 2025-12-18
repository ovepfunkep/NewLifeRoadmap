import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { generateId } from '../utils';
import { FiAlertCircle } from 'react-icons/fi';
import { Tooltip } from './Tooltip';

interface EditorModalProps {
  node: Node | null; // null = создание нового
  parentId: string | null;
  onSave: (node: Node) => void;
  onClose: () => void;
  initialDeadline?: Date; // Начальная дата для новой задачи
}

export function EditorModal({ node, parentId, onSave, onClose, initialDeadline }: EditorModalProps) {
  // Форматируем initialDeadline в строку для input type="date"
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Форматируем initialDeadline в строку для input type="time"
  const formatTimeForInput = (date: Date): string => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };
  
  const getInitialDeadlineDate = (): string => {
    if (node?.deadline) {
      return new Date(node.deadline).toISOString().slice(0, 10);
    }
    if (initialDeadline) {
      return formatDateForInput(initialDeadline);
    }
    return '';
  };
  
  const getInitialDeadlineTime = (): string => {
    if (node?.deadline) {
      return new Date(node.deadline).toISOString().slice(11, 16);
    }
    if (initialDeadline) {
      return formatTimeForInput(initialDeadline);
    }
    return '';
  };
  
  const [title, setTitle] = useState(node?.title || '');
  const [description, setDescription] = useState(node?.description || '');
  const [deadlineDate, setDeadlineDate] = useState(getInitialDeadlineDate());
  const [deadlineTime, setDeadlineTime] = useState(getInitialDeadlineTime());
  const [priority, setPriority] = useState(node?.priority || false);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);

  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setDescription(node.description || '');
      if (node.deadline) {
        const date = new Date(node.deadline);
        setDeadlineDate(date.toISOString().slice(0, 10));
        setDeadlineTime(date.toISOString().slice(11, 16));
      } else {
        setDeadlineDate('');
        setDeadlineTime('');
      }
      setPriority(node.priority || false);
    } else {
      // При создании новой задачи сбрасываем форму, но сохраняем initialDeadline
      setTitle('');
      setDescription('');
      setDeadlineDate(initialDeadline ? formatDateForInput(initialDeadline) : '');
      setDeadlineTime(initialDeadline ? formatTimeForInput(initialDeadline) : '');
      setPriority(false);
    }
  }, [node, initialDeadline]);

  // Обработка ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    // Запоминаем, где начался клик
    clickStartRef.current = {
      target: e.target,
      inside: modalRef.current?.contains(e.target as unknown as globalThis.Node) || false
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Закрываем только если клик начался и закончился вне модалки
    if (clickStartRef.current && !clickStartRef.current.inside) {
      const endedInside = modalRef.current?.contains(e.target as unknown as globalThis.Node) || false;
      if (!endedInside) {
        onClose();
      }
    }
    clickStartRef.current = null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) return;

    // Объединяем дату и время
    let deadline: string | null = null;
    if (deadlineDate) {
      if (deadlineTime) {
        deadline = new Date(`${deadlineDate}T${deadlineTime}`).toISOString();
      } else {
        deadline = new Date(`${deadlineDate}T00:00`).toISOString();
      }
    }

    const now = new Date().toISOString();
    const newNode: Node = node
      ? {
          ...node,
          title: title.trim(),
          description: description.trim() || undefined,
          deadline,
          priority,
          updatedAt: now,
        }
      : {
          id: generateId(),
          parentId,
          title: title.trim(),
          description: description.trim() || undefined,
          deadline,
          completed: false,
          priority,
          createdAt: now,
          updatedAt: now,
          children: [],
        };

    onSave(newNode);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          {node ? t('node.editNode') : t('node.createChild')}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder={t('editor.title')}
              required
              autoFocus
            />
            <Tooltip text={t('node.priority')}>
              <button
                type="button"
                onClick={() => setPriority(!priority)}
                className={`p-2 rounded-lg transition-all border hover:brightness-150 ${
                  priority
                    ? 'border-transparent'
                    : 'border-current hover:bg-accent/10'
                }`}
                style={{ 
                  color: 'var(--accent)',
                  backgroundColor: priority ? 'var(--accent)' : 'transparent'
                }}
              >
                <FiAlertCircle size={18} style={{ color: priority ? 'white' : 'var(--accent)' }} />
              </button>
            </Tooltip>
          </div>
          
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder={t('editor.description')}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t('editor.deadline')}
              </label>
              <input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t('editor.time')}
              </label>
              <input
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
          
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('general.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg text-white transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('general.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

