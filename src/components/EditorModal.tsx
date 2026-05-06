import { useState, useEffect, useRef } from 'react';
import { Node, NodeRecurrence, RecurrenceFrequency } from '../types';
import { t } from '../i18n';
import { generateId, buildBreadcrumbs } from '../utils';
import { FiAlertCircle, FiCalendar, FiClock, FiFolder } from 'react-icons/fi';
import { getNode } from '../db';
import { Tooltip } from './Tooltip';
import { ParentPickerModal } from './ParentPickerModal';
import { Z_MODAL } from '../config/zLayers';
import { useLanguage } from '../contexts/LanguageContext';
import { TelegramLinkModal } from './TelegramLinkModal';
import { AuthRequiredModal } from './AuthRequiredModal';
import { getCurrentUser } from '../firebase/auth';
import { getUserSecurityConfig } from '../firebase/security';
import { AnimatePresence, motion } from 'framer-motion';

interface EditorModalProps {
  node: Node | null; // null = создание нового
  parentId: string | null;
  onSave: (node: Node) => void;
  onClose: () => void;
  initialDeadline?: Date; // Начальная дата для новой задачи
  initialRecurring?: NodeRecurrence; // Пресет регулярности для новой задачи
}

export function EditorModal({ node, parentId, onSave, onClose, initialDeadline, initialRecurring }: EditorModalProps) {
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
  };
  
  const getInitialDeadlineTime = (): string => {
    if (!node && initialRecurring) {
      return '';
    }
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
    // Если есть начальная дата (создание из расписания), ставим 12:00 по умолчанию
    if (initialDeadline) {
      return '12:00';
    }
    return '';
  };
  
  const [title, setTitle] = useState(node?.title || '');
  const [description, setDescription] = useState(node?.description || '');
  const [deadlineDate, setDeadlineDate] = useState(getInitialDeadlineDate());
  const [deadlineTime, setDeadlineTime] = useState(getInitialDeadlineTime());
  const [isRecurring, setIsRecurring] = useState(node?.isRecurring || !!initialRecurring);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>(node?.recurrence?.freq || initialRecurring?.freq || 'daily');
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>(node?.recurrence?.weekdays || initialRecurring?.weekdays || [1]);
  const [recurrenceMonthDays, setRecurrenceMonthDays] = useState<number[]>(node?.recurrence?.monthDays || initialRecurring?.monthDays || [1]);
  const [recurrenceTimeStart, setRecurrenceTimeStart] = useState<string>(node?.recurrence?.timeStart || initialRecurring?.timeStart || '');
  const [recurrenceTimeEnd, setRecurrenceTimeEnd] = useState<string>(node?.recurrence?.timeEnd || initialRecurring?.timeEnd || '');
  const [priority, setPriority] = useState(node?.priority || false);
  const [chosenParentId, setChosenParentId] = useState<string | null>(null);
  const [showParentPicker, setShowParentPicker] = useState(false);
  /** null = загрузка; parentTitle — выбранный родитель, fullPath — цепочка для тултипа */
  const [parentLocation, setParentLocation] = useState<{
    parentTitle: string;
    fullPath: string;
  } | null>(null);
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
      setIsRecurring(node.isRecurring || false);
      setRecurrenceFreq(node.recurrence?.freq || 'daily');
      setRecurrenceWeekdays(node.recurrence?.weekdays || [1]);
      setRecurrenceMonthDays(node.recurrence?.monthDays || [1]);
      setRecurrenceTimeStart(node.recurrence?.timeStart || '');
      setRecurrenceTimeEnd(node.recurrence?.timeEnd || '');
      setPriority(node.priority || false);
      setReminders(node.reminders ? node.reminders.map(seconds => {
        if (seconds % 86400 === 0) return { value: seconds / 86400, unit: 'days' };
        return { value: Math.round(seconds / 3600), unit: 'hours' };
      }) : []);
    } else {
      // При создании новой задачи сбрасываем форму
      setTitle('');
      setDescription('');
      const hasRecurringPreset = !!initialRecurring;
      setDeadlineDate(hasRecurringPreset ? '' : (initialDeadline ? formatDateForInput(initialDeadline) : ''));
      setDeadlineTime(hasRecurringPreset ? '' : (initialDeadline ? '12:00' : ''));
      setIsRecurring(hasRecurringPreset);
      setRecurrenceFreq(initialRecurring?.freq || 'daily');
      setRecurrenceWeekdays(initialRecurring?.weekdays || [1]);
      setRecurrenceMonthDays(initialRecurring?.monthDays || [1]);
      setRecurrenceTimeStart(initialRecurring?.timeStart || '');
      setRecurrenceTimeEnd(initialRecurring?.timeEnd || '');
      setPriority(false);
      setReminders([]);
    }
  }, [node, initialDeadline, initialRecurring]);

  useEffect(() => {
    if (!node) {
      setChosenParentId(parentId);
    }
  }, [node, parentId]);

  useEffect(() => {
    if (node) return;
    const id = chosenParentId ?? parentId;
    if (!id) {
      setParentLocation({ parentTitle: '', fullPath: '' });
      return;
    }
    setParentLocation(null);
    let cancelled = false;
    (async () => {
      const crumbs = await buildBreadcrumbs(id, getNode);
      if (cancelled) return;
      const parentTitle = crumbs[crumbs.length - 1]?.title ?? '';
      const fullPath = crumbs.map((c) => c.title).join(' / ');
      setParentLocation({ parentTitle, fullPath });
    })();
    return () => {
      cancelled = true;
    };
  }, [node, chosenParentId, parentId]);

  // Обработка ESC: сначала закрыть пикер родителя, иначе всю модалку
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showParentPicker) {
          setShowParentPicker(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, showParentPicker]);

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

  const toggleWeekday = (day: number) => {
    setRecurrenceWeekdays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
    );
  };

  const toggleMonthDay = (day: number) => {
    setRecurrenceMonthDays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
    );
  };

  const getRecurrenceError = () => {
    if (!isRecurring) return null;
    if (recurrenceFreq === 'weekly' && recurrenceWeekdays.length === 0) {
      return t('editor.recurrenceWeeklyRequired');
    }
    if (recurrenceFreq === 'monthly' && recurrenceMonthDays.length === 0) {
      return t('editor.recurrenceMonthlyRequired');
    }

    const hasTimeStart = recurrenceTimeStart.trim().length > 0;
    const hasTimeEnd = recurrenceTimeEnd.trim().length > 0;
    if (hasTimeStart !== hasTimeEnd) {
      return t('editor.recurrenceTimePairRequired');
    }
    if (hasTimeStart && hasTimeEnd && recurrenceTimeEnd <= recurrenceTimeStart) {
      return t('editor.recurrenceTimeRangeInvalid');
    }
    return null;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDeadlineDate(newDate);
    // Если дата выбрана, а время еще нет — ставим полдень
    if (newDate && !deadlineTime && !isRecurring) {
      setDeadlineTime('12:00');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) return;

    const recurrenceError = getRecurrenceError();
    if (recurrenceError) {
      return;
    }

    // Регулярные задачи не используют дедлайн.
    let deadline: string | null = null;
    if (!isRecurring && deadlineDate) {
      if (deadlineTime) {
        deadline = new Date(`${deadlineDate}T${deadlineTime}`).toISOString();
      } else {
        deadline = new Date(`${deadlineDate}T00:00`).toISOString();
      }
    }

    const now = new Date().toISOString();
    const remindersInSeconds = isRecurring
      ? []
      : Array.from(new Set(
          reminders.map(r => r.unit === 'days' ? r.value * 86400 : r.value * 3600)
        )).sort((a, b) => a - b);

    // Проверка на наличие ошибок
    if (!isRecurring && reminders.some(rem => getReminderError(rem) !== null)) {
      return;
    }

    const normalizedWeekdays = Array.from(new Set(recurrenceWeekdays)).sort((a, b) => a - b);
    const normalizedMonthDays = Array.from(new Set(recurrenceMonthDays)).sort((a, b) => a - b);
    const recurrence = isRecurring
      ? {
          freq: recurrenceFreq,
          weekdays: recurrenceFreq === 'weekly' ? normalizedWeekdays : undefined,
          monthDays: recurrenceFreq === 'monthly' ? normalizedMonthDays : undefined,
          timeStart: recurrenceTimeStart || null,
          timeEnd: recurrenceTimeEnd || null,
        }
      : null;

    const newNode: Node = node
      ? {
          ...node,
          title: title.trim(),
          description: description.trim() || undefined,
          deadline,
          isRecurring,
          recurrence,
          priority,
          reminders: remindersInSeconds,
          updatedAt: now,
        }
      : {
          id: generateId(),
          parentId: chosenParentId ?? parentId,
          title: title.trim(),
          description: description.trim() || undefined,
          deadline,
          isRecurring,
          recurrence,
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

  const recurrenceError = getRecurrenceError();
  const weekdayOptions = language === 'ru'
    ? [
        { value: 1, label: 'Пн' },
        { value: 2, label: 'Вт' },
        { value: 3, label: 'Ср' },
        { value: 4, label: 'Чт' },
        { value: 5, label: 'Пт' },
        { value: 6, label: 'Сб' },
        { value: 0, label: 'Вс' },
      ]
    : [
        { value: 1, label: 'Mon' },
        { value: 2, label: 'Tue' },
        { value: 3, label: 'Wed' },
        { value: 4, label: 'Thu' },
        { value: 5, label: 'Fri' },
        { value: 6, label: 'Sat' },
        { value: 0, label: 'Sun' },
      ];

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: Z_MODAL }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex min-w-0 items-center gap-3">
          <h2
            className={`m-0 shrink-0 text-xl font-bold leading-tight text-gray-900 dark:text-gray-100 ${
              !node ? '-translate-y-0.5' : ''
            }`}
          >
            {node ? t('node.editNode') : t('node.createChild')}
          </h2>
          {!node && (
            <div className="flex min-w-0 flex-1 items-center">
              <div className="min-w-0 w-full">
              <Tooltip
                text={
                  parentLocation === null
                    ? t('general.loading')
                    : parentLocation.fullPath || parentLocation.parentTitle || t('editor.pickParentTooltip')
                }
                multiline
              >
                <button
                  type="button"
                  onClick={() => setShowParentPicker(true)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl border-2 border-gray-300 px-2.5 py-2 text-left transition-colors hover:border-accent/50 dark:border-gray-600"
                  aria-label={t('editor.pickParentTooltip')}
                >
                  <FiFolder
                    size={18}
                    className="shrink-0 text-gray-700 opacity-50 dark:text-gray-200"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {parentLocation === null ? t('general.loading') : parentLocation.parentTitle}
                  </span>
                </button>
              </Tooltip>
              </div>
            </div>
          )}
        </div>
        
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
          
          {!isRecurring && (
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
          )}

          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {t('editor.recurrenceTitle')}
              </span>
              <button
                type="button"
                onClick={() =>
                  setIsRecurring((prev) => {
                    const next = !prev;
                    if (next) {
                      setDeadlineDate('');
                      setDeadlineTime('');
                      setReminders([]);
                    }
                    return next;
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  isRecurring
                    ? 'text-white'
                    : 'text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                }`}
                style={isRecurring ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                {isRecurring ? t('editor.recurrenceEnabled') : t('editor.recurrenceDisabled')}
              </button>
            </div>

            <AnimatePresence initial={false}>
            {isRecurring && (
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-3 gap-2">
                  {(['daily', 'weekly', 'monthly'] as RecurrenceFrequency[]).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setRecurrenceFreq(freq)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all border ${
                        recurrenceFreq === freq
                          ? 'text-white border-transparent'
                          : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-accent/50'
                      }`}
                      style={recurrenceFreq === freq ? { backgroundColor: 'var(--accent)' } : undefined}
                    >
                      {t(`editor.recurrenceFreq${freq.charAt(0).toUpperCase()}${freq.slice(1)}`)}
                    </button>
                  ))}
                </div>

                {recurrenceFreq === 'weekly' && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('editor.recurrenceWeekdays')}</p>
                    <div className="grid grid-cols-7 gap-1">
                      {weekdayOptions.map((day) => {
                        const active = recurrenceWeekdays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleWeekday(day.value)}
                            className={`rounded-md py-1 text-[11px] font-semibold transition-all border ${
                              active
                                ? 'text-white border-transparent'
                                : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                            }`}
                            style={active ? { backgroundColor: 'var(--accent)' } : undefined}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {recurrenceFreq === 'monthly' && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('editor.recurrenceMonthDays')}</p>
                    <div className="grid grid-cols-8 gap-1 max-h-28 overflow-y-auto pr-1">
                      {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                        const active = recurrenceMonthDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleMonthDay(day)}
                            className={`rounded-md py-1 text-[11px] font-semibold transition-all border ${
                              active
                                ? 'text-white border-transparent'
                                : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                            }`}
                            style={active ? { backgroundColor: 'var(--accent)' } : undefined}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                      {t('editor.recurrenceTimeStart')}
                    </span>
                    <div
                      className="relative cursor-pointer"
                      onClick={() => {
                        const input = document.getElementById('recurrenceTimeStartInput');
                        if (input) (input as any).showPicker?.() || input.focus();
                      }}
                    >
                      <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                        {recurrenceTimeStart || <span className="text-gray-400 dark:text-gray-600">{t('editor.time')}</span>}
                      </div>
                      <FiClock className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent" size={18} />
                      <input
                        id="recurrenceTimeStartInput"
                        type="time"
                        value={recurrenceTimeStart}
                        onChange={(e) => setRecurrenceTimeStart(e.target.value)}
                        lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                        className="absolute inset-0 opacity-0 pointer-events-none"
                        aria-label={t('editor.recurrenceTimeStart')}
                      />
                    </div>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                      {t('editor.recurrenceTimeEnd')}
                    </span>
                    <div
                      className="relative cursor-pointer"
                      onClick={() => {
                        const input = document.getElementById('recurrenceTimeEndInput');
                        if (input) (input as any).showPicker?.() || input.focus();
                      }}
                    >
                      <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                        {recurrenceTimeEnd || <span className="text-gray-400 dark:text-gray-600">{t('editor.time')}</span>}
                      </div>
                      <FiClock className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent" size={18} />
                      <input
                        id="recurrenceTimeEndInput"
                        type="time"
                        value={recurrenceTimeEnd}
                        onChange={(e) => setRecurrenceTimeEnd(e.target.value)}
                        lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                        className="absolute inset-0 opacity-0 pointer-events-none"
                        aria-label={t('editor.recurrenceTimeEnd')}
                      />
                    </div>
                  </label>
                </div>

                {recurrenceError && (
                  <p className="text-[10px] text-red-500 px-1 font-medium">{recurrenceError}</p>
                )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>
          
          {/* Блок уведомлений Telegram */}
          {deadlineDate && !isRecurring && (
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
              disabled={(!isRecurring && reminders.some(rem => getReminderError(rem) !== null)) || recurrenceError !== null}
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
        {showParentPicker && (
          <ParentPickerModal
            onSelectParent={(id) => setChosenParentId(id)}
            onClose={() => setShowParentPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
