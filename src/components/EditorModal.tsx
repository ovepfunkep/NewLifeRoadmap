import { Fragment, useState, useEffect, useRef } from 'react';
import { Node, NodeRecurrence, RecurrenceFrequency, RecurrenceScheduleVariant } from '../types';
import { t } from '../i18n';
import { generateId, buildBreadcrumbs } from '../utils';
import { FiAlertCircle, FiCalendar, FiClock, FiFolder } from 'react-icons/fi';
import { getAllNodesFlat, getNode } from '../db';
import { Tooltip } from './Tooltip';
import { ParentPickerModal } from './ParentPickerModal';
import { Z_MODAL } from '../config/zLayers';
import { useLanguage } from '../contexts/LanguageContext';
import { TelegramLinkModal } from './TelegramLinkModal';
import { AuthRequiredModal } from './AuthRequiredModal';
import { getCurrentUser } from '../firebase/auth';
import { getUserSecurityConfig } from '../firebase/security';
import { AnimatePresence, motion } from 'framer-motion';
import {
  expandNodesToSlots,
  normalizeRecurrenceVariants,
  recurrenceVariantsTimeOverlapOnSharedDay,
} from '../utils/recurrence';
import { RecurrenceVariantsEditor } from './RecurrenceVariantsEditor';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { motionDurations, motionTransitions } from '../config/motion';
import { MobileBottomSheet } from './MobileBottomSheet';

function mapNodeRecurrenceToVariants(rule: NodeRecurrence, freq: 'weekly' | 'monthly'): RecurrenceScheduleVariant[] {
  const list = normalizeRecurrenceVariants(rule);
  if (freq === 'weekly') {
    return list.map((v) => ({
      weekdays: [...(v.weekdays ?? [])],
      timeStart: v.timeStart ?? '',
      timeEnd: v.timeEnd ?? '',
    }));
  }
  return list.map((v) => ({
    monthDays: [...(v.monthDays ?? [])],
    timeStart: v.timeStart ?? '',
    timeEnd: v.timeEnd ?? '',
  }));
}

interface EditorModalProps {
  node: Node | null; // null = создание нового
  parentId: string | null;
  onSave: (node: Node) => void;
  onClose: () => void;
  initialDeadline?: Date; // Начальная дата для новой задачи
  initialRecurring?: NodeRecurrence; // Пресет регулярности для новой задачи
}

export function EditorModal({ node, parentId, onSave, onClose, initialDeadline, initialRecurring }: EditorModalProps) {
  const { allowEssentialMotion } = useMotionPreferences();
  const { language } = useLanguage();
  const [showTgLinkModal, setShowTgLinkModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [timeConflicts, setTimeConflicts] = useState<Array<{ id: string; title: string }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  
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

  const getInitialDeadlineEndTime = (): string => {
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
  };
  
  const [title, setTitle] = useState(node?.title || '');
  const [description, setDescription] = useState(node?.description || '');
  const [deadlineDate, setDeadlineDate] = useState(getInitialDeadlineDate());
  const [deadlineTime, setDeadlineTime] = useState(getInitialDeadlineTime());
  const [deadlineEndTime, setDeadlineEndTime] = useState(getInitialDeadlineEndTime());
  const [isRecurring, setIsRecurring] = useState(node?.isRecurring || !!initialRecurring);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>(node?.recurrence?.freq || initialRecurring?.freq || 'daily');
  const [recurrenceVariants, setRecurrenceVariants] = useState<RecurrenceScheduleVariant[]>(() => {
    const r = node?.recurrence ?? initialRecurring;
    const f = r?.freq ?? 'daily';
    if (f === 'weekly' && r) return mapNodeRecurrenceToVariants(r, 'weekly');
    if (f === 'monthly' && r) return mapNodeRecurrenceToVariants(r, 'monthly');
    if (initialRecurring?.freq === 'weekly') return mapNodeRecurrenceToVariants(initialRecurring, 'weekly');
    if (initialRecurring?.freq === 'monthly') return mapNodeRecurrenceToVariants(initialRecurring, 'monthly');
    return [{ weekdays: [1], timeStart: '', timeEnd: '' }];
  });
  const [recurrenceVariantIndex, setRecurrenceVariantIndex] = useState(0);
  const [recurrenceTimeStart, setRecurrenceTimeStart] = useState<string>(() => {
    const f = node?.recurrence?.freq ?? initialRecurring?.freq ?? 'daily';
    if (f === 'daily') return node?.recurrence?.timeStart || initialRecurring?.timeStart || '';
    return '';
  });
  const [recurrenceTimeEnd, setRecurrenceTimeEnd] = useState<string>(() => {
    const f = node?.recurrence?.freq ?? initialRecurring?.freq ?? 'daily';
    if (f === 'daily') return node?.recurrence?.timeEnd || initialRecurring?.timeEnd || '';
    return '';
  });
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
      if (node.deadlineEnd) {
        const endDate = new Date(node.deadlineEnd);
        const endHours = endDate.getHours();
        const endMinutes = endDate.getMinutes();
        if (endHours === 0 && endMinutes === 0) {
          setDeadlineEndTime('');
        } else {
          setDeadlineEndTime(formatTimeForInput(endDate));
        }
      } else {
        setDeadlineEndTime('');
      }
      setIsRecurring(node.isRecurring || false);
      const rf = node.recurrence?.freq || 'daily';
      setRecurrenceFreq(rf);
      if (rf === 'daily') {
        setRecurrenceTimeStart(node.recurrence?.timeStart || '');
        setRecurrenceTimeEnd(node.recurrence?.timeEnd || '');
        setRecurrenceVariants([{ weekdays: [1], timeStart: '', timeEnd: '' }]);
      } else if (rf === 'weekly' && node.recurrence) {
        setRecurrenceVariants(mapNodeRecurrenceToVariants(node.recurrence, 'weekly'));
        setRecurrenceTimeStart('');
        setRecurrenceTimeEnd('');
      } else if (rf === 'monthly' && node.recurrence) {
        setRecurrenceVariants(mapNodeRecurrenceToVariants(node.recurrence, 'monthly'));
        setRecurrenceTimeStart('');
        setRecurrenceTimeEnd('');
      } else {
        setRecurrenceVariants([{ weekdays: [1], timeStart: '', timeEnd: '' }]);
        setRecurrenceTimeStart('');
        setRecurrenceTimeEnd('');
      }
      setRecurrenceVariantIndex(0);
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
      setDeadlineEndTime('');
      setIsRecurring(hasRecurringPreset);
      const irf = initialRecurring?.freq || 'daily';
      setRecurrenceFreq(irf);
      if (irf === 'daily') {
        setRecurrenceTimeStart(initialRecurring?.timeStart || '');
        setRecurrenceTimeEnd(initialRecurring?.timeEnd || '');
        setRecurrenceVariants([{ weekdays: [1], timeStart: '', timeEnd: '' }]);
      } else if (irf === 'weekly' && initialRecurring) {
        setRecurrenceVariants(mapNodeRecurrenceToVariants(initialRecurring, 'weekly'));
        setRecurrenceTimeStart('');
        setRecurrenceTimeEnd('');
      } else if (irf === 'monthly' && initialRecurring) {
        setRecurrenceVariants(mapNodeRecurrenceToVariants(initialRecurring, 'monthly'));
        setRecurrenceTimeStart('');
        setRecurrenceTimeEnd('');
      } else {
        setRecurrenceVariants([{ weekdays: [1], timeStart: '', timeEnd: '' }]);
        setRecurrenceTimeStart('');
        setRecurrenceTimeEnd('');
      }
      setRecurrenceVariantIndex(0);
      setPriority(false);
      setReminders([]);
    }
  }, [node, initialDeadline, initialRecurring]);

  useEffect(() => {
    setRecurrenceVariantIndex((i) => Math.min(i, Math.max(0, recurrenceVariants.length - 1)));
  }, [recurrenceVariants.length]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const handleRecurrenceFreqChange = (freq: RecurrenceFrequency) => {
    if (freq === recurrenceFreq) return;
    if (freq === 'daily') {
      if (recurrenceFreq === 'weekly' || recurrenceFreq === 'monthly') {
        const first = recurrenceVariants[0];
        setRecurrenceTimeStart(first?.timeStart || '');
        setRecurrenceTimeEnd(first?.timeEnd || '');
      }
    } else if (freq === 'weekly') {
      if (recurrenceFreq === 'daily') {
        setRecurrenceVariants([{ weekdays: [1], timeStart: recurrenceTimeStart, timeEnd: recurrenceTimeEnd }]);
      } else {
        const first = recurrenceVariants[0];
        setRecurrenceVariants([{ weekdays: [1], timeStart: first?.timeStart || '', timeEnd: first?.timeEnd || '' }]);
      }
    } else {
      if (recurrenceFreq === 'daily') {
        setRecurrenceVariants([{ monthDays: [1], timeStart: recurrenceTimeStart, timeEnd: recurrenceTimeEnd }]);
      } else {
        const first = recurrenceVariants[0];
        setRecurrenceVariants([{ monthDays: [1], timeStart: first?.timeStart || '', timeEnd: first?.timeEnd || '' }]);
      }
    }
    setRecurrenceVariantIndex(0);
    setRecurrenceFreq(freq);
  };

  const getRecurrenceError = () => {
    if (!isRecurring) return null;
    if (recurrenceFreq === 'weekly') {
      for (const v of recurrenceVariants) {
        if (!v.weekdays?.length) return t('editor.recurrenceWeeklyRequired');
        const hs = (v.timeStart || '').trim();
        const he = (v.timeEnd || '').trim();
        if ((hs.length > 0) !== (he.length > 0)) return t('editor.recurrenceTimePairRequired');
        if (hs && he && he <= hs) return t('editor.recurrenceTimeRangeInvalid');
      }
      if (recurrenceVariantsTimeOverlapOnSharedDay('weekly', recurrenceVariants)) {
        return t('editor.recurrenceSharedDayTimeOverlap');
      }
      return null;
    }
    if (recurrenceFreq === 'monthly') {
      for (const v of recurrenceVariants) {
        if (!v.monthDays?.length) return t('editor.recurrenceMonthlyRequired');
        const hs = (v.timeStart || '').trim();
        const he = (v.timeEnd || '').trim();
        if ((hs.length > 0) !== (he.length > 0)) return t('editor.recurrenceTimePairRequired');
        if (hs && he && he <= hs) return t('editor.recurrenceTimeRangeInvalid');
      }
      if (recurrenceVariantsTimeOverlapOnSharedDay('monthly', recurrenceVariants)) {
        return t('editor.recurrenceSharedDayTimeOverlap');
      }
      return null;
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

  const getDeadlineError = () => {
    if (isRecurring || !deadlineDate || !deadlineEndTime) return null;
    if (!deadlineTime) {
      return t('editor.deadlineEndNeedsStart');
    }
    if (deadlineEndTime <= deadlineTime) {
      return t('editor.deadlineTimeRangeInvalid');
    }
    return null;
  };

  const parseTimeToMinutes = (value: string): number | null => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  const getDraftTimeRange = () => {
    if (isRecurring) {
      if (recurrenceFreq === 'daily') {
        if (!recurrenceTimeStart || !recurrenceTimeEnd) return null;
        const startMinutes = parseTimeToMinutes(recurrenceTimeStart);
        const endMinutes = parseTimeToMinutes(recurrenceTimeEnd);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
        return { startMinutes, endMinutes };
      }
      if (recurrenceFreq === 'weekly' || recurrenceFreq === 'monthly') {
        const v = recurrenceVariants[recurrenceVariantIndex];
        if (!v?.timeStart || !v?.timeEnd) return null;
        const startMinutes = parseTimeToMinutes(v.timeStart);
        const endMinutes = parseTimeToMinutes(v.timeEnd);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
        return { startMinutes, endMinutes };
      }
      return null;
    }

    if (!deadlineDate || !deadlineTime) return null;
    const startMinutes = parseTimeToMinutes(deadlineTime);
    if (startMinutes === null) return null;

    let endMinutes = Math.min(startMinutes + 60, 24 * 60);
    if (deadlineEndTime) {
      const parsedEnd = parseTimeToMinutes(deadlineEndTime);
      if (parsedEnd === null) return null;
      if (parsedEnd <= startMinutes) return null;
      endMinutes = parsedEnd;
    }
    return { startMinutes, endMinutes };
  };

  const getConflictTargetDay = () => {
    if (!isRecurring) {
      if (!deadlineDate) return null;
      const selectedDay = new Date(`${deadlineDate}T00:00`);
      return Number.isFinite(selectedDay.getTime()) ? selectedDay : null;
    }

    // For recurring task created from week timeline, we receive an exact start day via initialDeadline.
    if (!node && initialDeadline) {
      const selectedDay = new Date(initialDeadline);
      selectedDay.setHours(0, 0, 0, 0);
      return Number.isFinite(selectedDay.getTime()) ? selectedDay : null;
    }

    return null;
  };

  useEffect(() => {
    let cancelled = false;

    const checkTimeConflicts = async () => {
      const draftRange = getDraftTimeRange();
      const targetDay = getConflictTargetDay();
      if (!draftRange || !targetDay) {
        setTimeConflicts([]);
        return;
      }

      const allNodes = await getAllNodesFlat();
      if (cancelled) return;

      const candidateNodes = allNodes.filter((item) => !item.deletedAt && !item.completed && item.id !== node?.id);
      const daySlots = expandNodesToSlots(candidateNodes, targetDay, 1);
      const conflicts = new Map<string, { id: string; title: string }>();

      for (const slot of daySlots) {
        const isOverlapping = slot.isAllDay
          ? true
          : slot.startMinutes !== null &&
            slot.endMinutes !== null &&
            draftRange.startMinutes < slot.endMinutes &&
            draftRange.endMinutes > slot.startMinutes;
        if (isOverlapping) {
          conflicts.set(slot.taskId, { id: slot.taskId, title: slot.title });
        }
      }

      setTimeConflicts(Array.from(conflicts.values()));
    };

    void checkTimeConflicts();
    return () => {
      cancelled = true;
    };
  }, [
    isRecurring,
    deadlineDate,
    deadlineTime,
    deadlineEndTime,
    recurrenceFreq,
    recurrenceTimeStart,
    recurrenceTimeEnd,
    recurrenceVariants,
    recurrenceVariantIndex,
    initialDeadline,
    node,
  ]);

  const handleConflictClick = (taskId: string) => {
    onClose();
    window.location.hash = `#/node/${taskId}`;
  };

  const openInputPicker = (inputId: string) => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // Fallback for browsers that block showPicker without gesture.
    }
    input.focus();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDeadlineDate(newDate);
    if (!newDate) {
      setDeadlineEndTime('');
      return;
    }
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
    const deadlineError = getDeadlineError();
    if (deadlineError) {
      return;
    }

    // Регулярные задачи не используют дедлайн.
    let deadline: string | null = null;
    let deadlineEnd: string | null = null;
    if (!isRecurring && deadlineDate) {
      if (deadlineTime) {
        deadline = new Date(`${deadlineDate}T${deadlineTime}`).toISOString();
      } else {
        deadline = new Date(`${deadlineDate}T00:00`).toISOString();
      }
      if (deadlineTime && deadlineEndTime) {
        deadlineEnd = new Date(`${deadlineDate}T${deadlineEndTime}`).toISOString();
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

    let recurrence: NodeRecurrence | null = null;
    if (isRecurring) {
      if (recurrenceFreq === 'daily') {
        recurrence = {
          freq: 'daily',
          timeStart: recurrenceTimeStart.trim() || null,
          timeEnd: recurrenceTimeEnd.trim() || null,
        };
      } else if (recurrenceFreq === 'weekly') {
        const cleaned = recurrenceVariants.map((v) => ({
          weekdays: Array.from(new Set(v.weekdays ?? [])).sort((a, b) => a - b),
          timeStart: v.timeStart?.trim() || null,
          timeEnd: v.timeEnd?.trim() || null,
        }));
        if (cleaned.length === 1) {
          recurrence = {
            freq: 'weekly',
            weekdays: cleaned[0].weekdays,
            timeStart: cleaned[0].timeStart,
            timeEnd: cleaned[0].timeEnd,
          };
        } else {
          recurrence = {
            freq: 'weekly',
            scheduleVariants: cleaned,
          };
        }
      } else {
        const cleaned = recurrenceVariants.map((v) => ({
          monthDays: Array.from(new Set(v.monthDays ?? [])).sort((a, b) => a - b),
          timeStart: v.timeStart?.trim() || null,
          timeEnd: v.timeEnd?.trim() || null,
        }));
        if (cleaned.length === 1) {
          recurrence = {
            freq: 'monthly',
            monthDays: cleaned[0].monthDays,
            timeStart: cleaned[0].timeStart,
            timeEnd: cleaned[0].timeEnd,
          };
        } else {
          recurrence = {
            freq: 'monthly',
            scheduleVariants: cleaned,
          };
        }
      }
    }

    const newNode: Node = node
      ? {
          ...node,
          title: title.trim(),
          description: description.trim() || undefined,
          deadline,
          deadlineEnd,
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
          deadlineEnd,
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
  const deadlineError = getDeadlineError();
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

  const editorContent = (
    <>
        <div className={`flex min-w-0 items-center gap-3 ${isMobile ? 'mb-3' : 'mb-6'}`}>
          <h2
            className={`m-0 shrink-0 font-bold leading-tight text-gray-900 dark:text-gray-100 ${
              isMobile ? 'text-lg' : 'text-xl'
            } ${!node ? '-translate-y-0.5' : ''}`}
          >
            {node ? t('node.editNode') : t('node.createChild')}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className={isMobile ? 'space-y-3' : 'space-y-5'}>
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
              rows={isMobile ? (description.length > 50 ? 3 : 1) : 3}
              className={`w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-accent focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-600 ${
                isMobile && description.length <= 50
                  ? 'resize-none overflow-hidden py-2.5 leading-snug'
                  : 'resize-none py-3'
              }`}
              placeholder={t('editor.description')}
            />
          </div>
          
          {!isRecurring && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="relative group">
                  <div 
                    className="relative cursor-pointer"
                    onClick={() => openInputPicker('deadlineDateInput')}
                  >
                    <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                      {deadlineDate ? new Date(deadlineDate).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }) : <span className="text-gray-400 dark:text-gray-600">{t('editor.date')}</span>}
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
                    onClick={() => openInputPicker('deadlineTimeInput')}
                  >
                    <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                      {deadlineTime || <span className="text-gray-400 dark:text-gray-600">{t('editor.timeStart')}</span>}
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
                <div className="relative group">
                  <div 
                    className="relative cursor-pointer"
                    onClick={() => openInputPicker('deadlineEndTimeInput')}
                  >
                    <div className="w-full pl-10 pr-2 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 transition-all text-sm flex items-center h-[48px] whitespace-nowrap overflow-hidden">
                      {deadlineEndTime || <span className="text-gray-400 dark:text-gray-600">{t('editor.timeEndOptional')}</span>}
                    </div>
                    <FiClock className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent" size={18} />
                    <input
                      id="deadlineEndTimeInput"
                      type="time"
                      value={deadlineEndTime}
                      onChange={(e) => setDeadlineEndTime(e.target.value)}
                      lang={language === 'ru' ? 'ru-RU' : 'en-US'}
                      className="absolute inset-0 opacity-0 pointer-events-none"
                    />
                  </div>
                </div>
              </div>
              {deadlineError && (
                <p className="text-[10px] text-red-500 px-1 font-medium">{deadlineError}</p>
              )}
              {!deadlineError && timeConflicts.length > 0 && (
                <p className="text-[10px] px-1 font-medium text-amber-600 dark:text-amber-400">
                  {t('editor.timeConflictPrefix')}{' '}
                  {timeConflicts.map((conflict, index) => (
                    <Fragment key={conflict.id}>
                      <button
                        type="button"
                        onClick={() => handleConflictClick(conflict.id)}
                        className="underline underline-offset-2 hover:opacity-80"
                        style={{ color: 'var(--accent)' }}
                      >
                        {conflict.title}
                      </button>
                      {index < timeConflicts.length - 1 ? ', ' : ''}
                    </Fragment>
                  ))}
                </p>
              )}
            </div>
          )}

          <div
            className={`rounded-2xl border-2 border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50 ${
              isMobile ? 'space-y-3 p-3' : 'space-y-4 p-4'
            }`}
          >
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
                      setDeadlineEndTime('');
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
                      onClick={() => handleRecurrenceFreqChange(freq)}
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
                  <RecurrenceVariantsEditor
                    frequency="weekly"
                    variants={recurrenceVariants}
                    onVariantsChange={setRecurrenceVariants}
                    activeIndex={recurrenceVariantIndex}
                    onActiveIndexChange={setRecurrenceVariantIndex}
                    isMobile={isMobile}
                    allowEssentialMotion={allowEssentialMotion}
                    openInputPicker={openInputPicker}
                    weekdayOptions={weekdayOptions}
                  />
                )}

                {recurrenceFreq === 'monthly' && (
                  <RecurrenceVariantsEditor
                    frequency="monthly"
                    variants={recurrenceVariants}
                    onVariantsChange={setRecurrenceVariants}
                    activeIndex={recurrenceVariantIndex}
                    onActiveIndexChange={setRecurrenceVariantIndex}
                    isMobile={isMobile}
                    allowEssentialMotion={allowEssentialMotion}
                    openInputPicker={openInputPicker}
                    weekdayOptions={weekdayOptions}
                  />
                )}

                {recurrenceFreq === 'daily' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                      {t('editor.recurrenceTimeStart')}
                    </span>
                    <div
                      className="relative cursor-pointer"
                      onClick={() => openInputPicker('recurrenceTimeStartInput')}
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
                      onClick={() => openInputPicker('recurrenceTimeEndInput')}
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
                )}

                {recurrenceError && (
                  <p className="text-[10px] text-red-500 px-1 font-medium">{recurrenceError}</p>
                )}
                {!recurrenceError && timeConflicts.length > 0 && (
                  <p className="text-[10px] px-1 font-medium text-amber-600 dark:text-amber-400">
                    {t('editor.timeConflictPrefix')}{' '}
                    {timeConflicts.map((conflict, index) => (
                      <Fragment key={conflict.id}>
                        <button
                          type="button"
                          onClick={() => handleConflictClick(conflict.id)}
                          className="underline underline-offset-2 hover:opacity-80"
                          style={{ color: 'var(--accent)' }}
                        >
                          {conflict.title}
                        </button>
                        {index < timeConflicts.length - 1 ? ', ' : ''}
                      </Fragment>
                    ))}
                  </p>
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

          {!node && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {t('editor.pickParentTitle')}
              </p>
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
          )}
          
          <div className={`flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end ${isMobile ? 'sm:pt-2' : 'pt-2'}`}>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-6 py-2.5 text-sm font-bold rounded-xl border-2 border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all sm:w-auto"
            >
              {t('general.cancel')}
            </button>
            <button
              type="submit"
              disabled={(!isRecurring && reminders.some(rem => getReminderError(rem) !== null)) || recurrenceError !== null || deadlineError !== null}
              className="w-full px-8 py-2.5 text-sm font-bold rounded-xl text-white transition-all shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 sm:w-auto"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('general.save')}
            </button>
          </div>
        </form>
    </>
  );

  return (
    <>
      {isMobile ? (
        <MobileBottomSheet isOpen={true} onClose={onClose} compact>
          <div className="max-h-[88vh] overflow-y-auto px-0.5 pb-0.5 [-webkit-overflow-scrolling:touch]">
            {editorContent}
          </div>
        </MobileBottomSheet>
      ) : (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{ zIndex: Z_MODAL }}
          onMouseDown={handleBackdropMouseDown}
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            allowEssentialMotion
              ? motionTransitions.fade
              : { duration: motionDurations.fast }
          }
        >
          <motion.div
            ref={modalRef}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
            initial={allowEssentialMotion ? { y: 20, scale: 0.98, opacity: 0.92 } : { opacity: 1 }}
            animate={allowEssentialMotion ? { y: 0, scale: 1, opacity: 1 } : { opacity: 1 }}
            exit={allowEssentialMotion ? { y: 20, scale: 0.98, opacity: 0 } : { opacity: 0 }}
            transition={
              allowEssentialMotion
                ? motionTransitions.modal
                : { duration: motionDurations.fast }
            }
          >
            {editorContent}
          </motion.div>
        </motion.div>
      )}

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
    </>
  );
}
