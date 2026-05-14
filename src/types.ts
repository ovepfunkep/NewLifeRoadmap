export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Один интервал дней + время для weekly/monthly/yearly (несколько вариантов в одной задаче). */
export interface RecurrenceScheduleVariant {
  weekdays?: number[];
  monthDays?: number[];
  yearlyMonth?: number;
  yearlyMonthDay?: number;
  timeStart?: string | null;
  /** Если пусто при заданном timeStart — считается блок +60 минут от начала */
  timeEnd?: string | null;
}

export interface NodeRecurrence {
  freq: RecurrenceFrequency;
  // weekly: [0..6], где 0 = Sunday, 1 = Monday ... 6 = Saturday
  weekdays?: number[];
  // monthly: [1..31]
  monthDays?: number[];
  /** yearly: календарный месяц 1–12 и число 1–31 (один раз в год) */
  yearlyMonth?: number;
  yearlyMonthDay?: number;
  // HH:mm — «по» необязательно: пусто означает блок +60 мин после «с»
  timeStart?: string | null;
  timeEnd?: string | null;
  /** Несколько интервалов: weekly/monthly/yearly — вместо плоских полей выше. */
  scheduleVariants?: RecurrenceScheduleVariant[];
}

// Тип узла (мапы)
export interface Node {
  id: string; // UUID
  parentId: string | null;
  title: string;
  description?: string;
  deadline?: string | null; // ISO
  deadlineEnd?: string | null; // ISO, optional end time for one-off tasks
  isRecurring?: boolean; // Регулярная задача (информативно в расписании)
  recurrence?: NodeRecurrence | null; // Правило повторения, если isRecurring = true
  completed: boolean;
  completedAt?: string | null; // ISO время завершения
  priority?: boolean; // Приоритетная задача
  order?: number; // Порядок отображения
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  /** Устар.: раньше soft-delete; новые записи не пишут. Импорт старых JSON может содержать поле. */
  deletedAt?: string | null;
  reminders?: number[]; // Интервалы напоминаний в секундах до дедлайна
  sentReminders?: string[]; // Список ID уже отправленных уведомлений (интервал + время)
  nextReminderAt?: number | null; // Следующее напоминание (epoch ms)
  children: Node[]; // рекурсивная структура
}

// Статус дедлайна
export type DeadlineStatus = 'future' | 'soon' | 'overdue' | 'none';

// Стратегия импорта
export type ImportStrategy = 'add' | 'replace';

// Структура i18n
export interface I18nKeys {
  general: {
    appName: string;
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    create: string;
    close: string;
  };
  node: {
    markCompleted: string;
    markIncomplete: string;
    editNode: string;
    createChild: string;
    deleteNode: string;
    deleteConfirm: string;
    noChildren: string;
    progress: string;
  };
  importExport: {
    import: string;
    export: string;
    importTitle: string;
    exportTitle: string;
    strategyAdd: string;
    strategyReplace: string;
    importHint: string;
    exportHint: string;
    selectFile: string;
  };
  deadline: {
    title: string;
    none: string;
    overdue: string;
    soon: string;
    future: string;
    noDeadlines: string;
  };
  toast: {
    undo: string;
    nodeDeleted: string;
    nodeSaved: string;
    importSuccess: string;
    importError: string;
  };
  theme: {
    light: string;
    dark: string;
    system: string;
  };
  breadcrumb: {
    root: string;
  };
}

