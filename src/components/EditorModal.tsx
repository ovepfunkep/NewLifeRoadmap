import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { t } from '../i18n';
import { generateId } from '../utils';
import { FiAlertCircle, FiCalendar, FiClock } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { useLanguage } from '../contexts/LanguageContext';
import { TelegramLinkModal } from './TelegramLinkModal';
import { AuthRequiredModal } from './AuthRequiredModal';
import { getCurrentUser } from '../firebase/auth';
import { getUserSecurityConfig } from '../firebase/security';

interface EditorModalProps {
  node: Node | null; // null = создание нового
  parentId: string | null;
  onSave: (node: Node) => void;
  onClose: () => void;
  initialDeadline?: Date; // Начальная дата для новой задачи
}

export function EditorModal({ node, parentId, onSave, onClose, initialDeadline }: EditorModalProps) {
  const { language } = useLanguage();
  const [showTgLinkModal, setShowTgLinkModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
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
      return formatDateForInput(new Date(node.deadline));
    }
    if (initialDeadline) {
      return formatDateForInput(initialDeadline);
    }
    return '';
  };
  
  const getInitialDeadlineTime = (): string => {
    if (node?.deadline) {
      const date = new Date(node.deadline);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      // Если время 00:00, считаем его пустым (сентинель для "только дата")
      if (hours === 0 && minutes === 0) {
        return '';
      }
      return formatTimeForInput(date);
    }
    // Для новых задач не заполняем время по умолчанию (даже если есть initialDeadline)
    return '';
  };
  
  const [title, setTitle] = useState(node?.title || '');
  const [description, setDescription] = useState(node?.description || '');
  const [deadlineDate, setDeadlineDate] = useState(getInitialDeadlineDate());
  const [deadlineTime, setDeadlineTime] = useState(getInitialDeadlineTime());
  const [priority, setPriority] = useState(node?.priority || false);
  const [reminders, setReminders] = useState<{ value: number; unit: 'hours' | 'days' }[]>(() => {
    if (node?.reminders) {
      return node.reminders.map(seconds => {
        if (seconds % 86400 === 0) return { value: seconds / 86400, unit: 'days' };
        return { value: Math.round(seconds / 3600), unit: 'hours' };
      });
    }
    return [];
  });
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);

  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setDescription(node.description || '');
      if (node.deadline) {
        const date = new Date(node.deadline);
        setDeadlineDate(formatDateForInput(date));
        const hours = date.getHours();
        const minutes = date.getMinutes();
        if (hours === 0 && minutes === 0) {
          setDeadlineTime('');
        } else {
          setDeadlineTime(formatTimeForInput(date));
        }
      } else {
        setDeadlineDate('');
        setDeadlineTime('');
      }
      setPriority(node.priority || false);
      setReminders(node.reminders ? node.reminders.map(seconds => {
        if (seconds % 86400 === 0) return { value: seconds / 86400, unit: 'days' };
        return { value: Math.round(seconds / 3600), unit: 'hours' };
      }) : []);
    } else {
      // При создании новой задачи сбрасываем форму, сохраняем дату из initialDeadline, но время оставляем пустым
      setTitle('');
      setDescription('');
      setDeadlineDate(initialDeadline ? formatDateForInput(initialDeadline) : '');
      setDeadlineTime('');
      setPriority(false);
      setReminders([]);
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

  const handleRemoveReminder = (index: number) => {
    setReminders(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateReminder = (index: number, field: 'value' | 'unit', value: any) => {
    setReminders(prev => prev.map((rem, i) => i === index ? { ...rem, [field]: value } : rem));
  };

  const handleAddReminder = async () => {
    const user = getCurrentUser();
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    const config = await getUserSecurityConfig(user.uid);
    if (!config?.telegramChatId) {
      setShowTgLinkModal(true);
      return;
    }

    // Находим интервал, которого еще нет в списке (по умолчанию 1 час)
    let newValue = 1;
    let newUnit: 'hours' | 'days' = 'hours';
    
    const exists = (v: number, u: string) => 
      reminders.some(r => r.value === v && r.unit === u);

    if (exists(1, 'hours')) {
      if (!exists(2, 'hours')) newValue = 2;
      else if (!exists(1, 'days')) { newValue = 1; newUnit = 'days'; }
      else {
        // Если база занята, просто берем следующее свободное число часов
        let i = 3;
        while (exists(i, 'hours')) i++;
        newValue = i;
      }
    }

    setReminders(prev => [...prev, { value: newValue, unit: newUnit }]);
  };

  const getReminderError = (rem: { value: number; unit: 'hours' | 'days' }) => {
    if (!deadlineDate || !deadlineTime) return null;
    
    const deadline = new Date(`${deadlineDate}T${deadlineTime}`);
    const intervalSeconds = rem.unit === 'days' ? rem.value * 86400 : rem.value * 3600;
    const reminderTime = new Date(deadline.getTime() - intervalSeconds * 1000);
    const now = new Date();

    if (intervalSeconds < 3600) return t('telegram.errorTooLate');
    if (reminderTime <= now) return t('telegram.errorPast');
    
    // Проверка на дубликаты
    const sameIntervalsCount = reminders.filter(r => 
      (r.unit === 'days' ? r.value * 86400 : r.value * 3600) === intervalSeconds
    ).length;
    
    if (sameIntervalsCount > 1) return t('telegram.errorDuplicate');

    return null;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDeadlineDate(newDate);
    // Если дата выбрана, а время еще нет — ставим полдень
    if (newDate && !deadlineTime) {
      setDeadlineTime('12:00');
    }
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
    const remindersInSeconds = Array.from(new Set(
      reminders.map(r => r.unit === 'days' ? r.value * 86400 : r.value * 3600)
    )).sort((a, b) => a - b);

    // Проверка на наличие ошибок
    if (reminders.some(rem => getReminderError(rem) !== null)) {
      return;
    }

    const newNode: Node = node
      ? {
          ...node,
          title: title.trim(),
          description: description.trim() || undefined,
          deadline,
          priority,
          reminders: remindersInSeconds,
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
          reminders: remindersInSeconds,
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
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          {node ? t('node.editNode') : t('node.createChild')}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:border-accent transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600"
                placeholder={t('editor.title')}
                required
                autoFocus
              />
            </div>
            <Tooltip text={t('node.priority')}>
              <button
                type="button"
                onClick={() => setPriority(!priority)}
                className={`p-3 rounded-xl transition-all border-2 ${
                  priority
                    ? 'border-transparent shadow-lg shadow-accent/20'
                    : 'border-gray-100 dark:border-gray-800 hover:border-accent/30'
                }`}
                style={{ 
                  color: priority ? 'white' : 'var(--accent)',
                  backgroundColor: priority ? 'var(--accent)' : 'transparent'
                }}
              >
                <FiAlertCircle size={20} />
              </button>
            </Tooltip>
          </div>
          
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:border-accent transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 text-sm resize-none"
              placeholder={t('editor.description')}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="relative group">
              <div 
                className="relative cursor-pointer"
                onClick={() => {
                  const input = document.getElementById('deadlineDateInput');
                  if (input) (input as any).showPicker?.() || input.focus();
                }}
              >
                <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                  {deadlineDate ? new Date(deadlineDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }) : <span className="text-gray-400 dark:text-gray-600">Дата</span>}
                </div>
                <FiCalendar className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent" size={18} />
                <input
                  id="deadlineDateInput"
                  type="date"
                  value={deadlineDate}
                  onChange={handleDateChange}
                  lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                  className="absolute inset-0 opacity-0 pointer-events-none"
                />
              </div>
            </div>
            <div className="relative group">
              <div 
                className="relative cursor-pointer"
                onClick={() => {
                  const input = document.getElementById('deadlineTimeInput');
                  if (input) (input as any).showPicker?.() || input.focus();
                }}
              >
                <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                  {deadlineTime || <span className="text-gray-400 dark:text-gray-600">Время</span>}
                </div>
                <FiClock className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent" size={18} />
                <input
                  id="deadlineTimeInput"
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                  className="absolute inset-0 opacity-0 pointer-events-none"
                />
              </div>
            </div>
          </div>
          
          {/* Блок уведомлений Telegram */}
          {deadlineDate && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-gray-100 dark:border-gray-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  {t('telegram.title')}
                </span>
                <button
                  type="button"
                  onClick={handleAddReminder}
                  className="text-xs font-bold hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                >
                  + {t('telegram.addReminder')}
                </button>
              </div>
              
              {reminders.length > 0 ? (
                <div className="space-y-3">
                  {reminders.map((rem, idx) => {
                    const error = getReminderError(rem);
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="shrink-0">{t('telegram.remindMe')}</span>
                          <input
                            type="number"
                            min="1"
                            value={rem.value}
                            onChange={(e) => handleUpdateReminder(idx, 'value', parseInt(e.target.value) || 0)}
                            className={`w-14 px-2 py-1 bg-white dark:bg-gray-800 border-2 rounded-lg text-center focus:outline-none transition-all ${
                              error ? 'border-red-200 focus:border-red-500' : 'border-gray-100 dark:border-gray-700 focus:border-accent'
                            }`}
                          />
                          <select
                            value={rem.unit}
                            onChange={(e) => handleUpdateReminder(idx, 'unit', e.target.value)}
                            className={`px-2 py-1 bg-white dark:bg-gray-800 border-2 rounded-lg focus:outline-none transition-all ${
                              error ? 'border-red-200 focus:border-red-500' : 'border-gray-100 dark:border-gray-700 focus:border-accent'
                            }`}
                          >
                            <option value="hours">{t('telegram.hours')}</option>
                            <option value="days">{t('telegram.days')}</option>
                          </select>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveReminder(idx)}
                            className="ml-auto p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            &times;
                          </button>
                        </div>
                        {error && (
                          <p className="text-[10px] text-red-500 px-1 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic text-center py-1">
                  Напоминания не настроены
                </p>
              )}
            </div>
          )}
          
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold rounded-xl border-2 border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
            >
              {t('general.cancel')}
            </button>
            <button
              type="submit"
              disabled={reminders.some(rem => getReminderError(rem) !== null)}
              className="px-8 py-2.5 text-sm font-bold rounded-xl text-white transition-all shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-95"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('general.save')}
            </button>
          </div>
        </form>
        
        {showTgLinkModal && (
          <TelegramLinkModal onClose={() => setShowTgLinkModal(false)} />
        )}
        {showAuthModal && (
          <AuthRequiredModal 
            onClose={() => setShowAuthModal(false)} 
            onSuccess={() => {
              setShowAuthModal(false);
              handleAddReminder();
            }}
          />
        )}
      </div>
    </div>
  );
}
