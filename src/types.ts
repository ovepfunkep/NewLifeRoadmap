// Тип узла (мапы)
export interface Node {
  id: string; // UUID
  parentId: string | null;
  title: string;
  description?: string;
  deadline?: string | null; // ISO
  completed: boolean;
  completedAt?: string | null; // ISO время завершения
  priority?: boolean; // Приоритетная задача
  order?: number; // Порядок отображения
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  deletedAt?: string | null; // ISO, soft-delete tombstone
  reminders?: number[]; // Интервалы напоминаний в секундах до дедлайна
  sentReminders?: string[]; // Список ID уже отправленных уведомлений (интервал + время)
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

