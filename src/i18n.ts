import { useMemo } from 'react';
import { useLanguage } from './contexts/LanguageContext';

export type Language = 'ru' | 'en';

// Локализация
export const i18n: Record<Language, Record<string, any>> = {
  en: {
    general: {
      appName: 'LifeRoadmap',
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      close: 'Close',
      notFound: 'Task not found',
    },
    node: {
      markCompleted: 'Mark as completed',
      markIncomplete: 'Mark as incomplete',
      editNode: 'Edit task',
      createChild: 'Create subtask',
      deleteNode: 'Delete task',
      deleteConfirm: 'Delete this task and all its children?',
      noChildren: 'No subtasks',
      progress: 'Progress',
      move: 'Move',
      moveTitle: 'Move task',
      steps: 'Steps',
      priority: 'Priority task',
    },
    move: {
      selectTarget: 'Select task to move into',
    },
    editor: {
      title: 'Title *',
      description: 'Description',
      deadline: 'Deadline',
      time: 'Time',
    },
    filter: {
      all: 'All',
      completed: 'Completed',
      incomplete: 'Incomplete',
    },
    sort: {
      name: 'Sort by name',
      deadline: 'Sort by deadline',
    },
    keyboard: {
      esc: 'ESC - Close modal / Go to parent',
      addStep: 'T - Add step',
      edit: 'R - Edit current map',
      crtlNumber: 'CTRL + Number - Go to breadcrumb',
      number: 'Number - Go to step',
    },
    importExport: {
      import: 'Import',
      export: 'Export',
      importTitle: 'Import task',
      exportTitle: 'Export task',
      strategyAdd: 'Add',
      strategyReplace: 'Replace',
      importHint: 'Select JSON file to import',
      exportHint: 'Download current task as JSON',
      selectFile: 'Select file',
    },
    deadline: {
      title: 'Upcoming deadlines',
      none: 'No deadline',
      overdue: 'Overdue',
      soon: 'Soon (≤3 days)',
      future: 'Future',
      noDeadlines: 'No deadlines',
    },
    toast: {
      undo: 'Undo',
      nodeDeleted: 'Task deleted',
      nodeSaved: 'Task saved',
      importSuccess: 'Import completed successfully',
      importError: 'Import error',
      nodeMoved: 'Task moved',
      syncSuccess: 'Data synchronized',
      syncError: 'Sync error',
      syncLoading: 'Syncing...',
      syncInProgress: 'Updating cloud data...',
      doNotClose: 'Do not close the page',
      syncingCloud: 'Updating cloud data...',
    },
    sync: {
      signIn: 'Sign in with Google',
      signOut: 'Sign out',
      syncing: 'Syncing...',
      signedInAs: 'Signed in as',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    breadcrumb: {
      root: 'Your Life Roadmaps',
    },
    tooltip: {
      signIn: 'Sign in with Google',
      signOut: 'Sign out',
      telegram: "Author's Telegram",
      github: 'Project on GitHub',
      removePriority: 'Remove priority',
      priority: 'Priority task',
    },
  },
  ru: {
    general: {
      appName: 'LifeRoadmap',
      loading: 'Загрузка...',
      save: 'Сохранить',
      cancel: 'Отмена',
      delete: 'Удалить',
      edit: 'Редактировать',
      create: 'Создать',
      close: 'Закрыть',
      notFound: 'Задача не найдена',
    },
    node: {
      markCompleted: 'Отметить готовым',
      markIncomplete: 'Отметить как неготовый',
      editNode: 'Редактировать задачу',
      createChild: 'Создать подзадачу',
      deleteNode: 'Удалить задачу',
      deleteConfirm: 'Удалить эту задачу и всех её потомков?',
      noChildren: 'Нет подзадач',
      progress: 'Прогресс',
      move: 'Переместить',
      moveTitle: 'Переместить задачу',
      steps: 'Шаги',
      priority: 'Приоритетная задача',
    },
    move: {
      selectTarget: 'Выберите задачу, в которую нужно переместить',
    },
    editor: {
      title: 'Название *',
      description: 'Описание',
      deadline: 'Дедлайн',
      time: 'Время',
    },
    filter: {
      all: 'Все',
      completed: 'Выполненные',
      incomplete: 'Невыполненные',
    },
    sort: {
      name: 'Сортировка по имени',
      deadline: 'Сортировка по дедлайну',
    },
    keyboard: {
      esc: 'ESC - Закрыть попап / Перейти к родителю',
      addStep: 'T - Добавить шаг',
      edit: 'R - Редактировать текущую мапу',
      crtlNumber: 'CTRL + Цифра - Переход к крошке',
      number: 'Цифра - Переход к шагу',
    },
    importExport: {
      import: 'Импорт',
      export: 'Экспорт',
      importTitle: 'Импорт задачи',
      exportTitle: 'Экспорт задачи',
      strategyAdd: 'Добавить (add)',
      strategyReplace: 'Заменить (replace)',
      importHint: 'Выберите JSON файл для импорта',
      exportHint: 'Скачать текущую задачу как JSON',
      selectFile: 'Выбрать файл',
    },
    deadline: {
      title: 'Ближайшие дедлайны',
      none: 'Без дедлайна',
      overdue: 'Просрочено',
      soon: 'Скоро (≤3 дня)',
      future: 'Будущее',
      noDeadlines: 'Нет дедлайнов',
    },
    toast: {
      undo: 'Отменить',
      nodeDeleted: 'Задача удалена',
      nodeSaved: 'Задача сохранена',
      importSuccess: 'Импорт выполнен успешно',
      importError: 'Ошибка импорта',
      nodeMoved: 'Задача перемещена',
      syncSuccess: 'Данные синхронизированы',
      syncError: 'Ошибка синхронизации',
      syncLoading: 'Синхронизация...',
      syncInProgress: 'Обновление данных в облаке...',
      doNotClose: 'Не закрывайте страницу',
      syncingCloud: 'Обновляем данные в облаке...',
    },
    sync: {
      signIn: 'Войти через Google',
      signOut: 'Выйти',
      syncing: 'Синхронизация...',
      signedInAs: 'Вошли как',
    },
    theme: {
      light: 'Светлая',
      dark: 'Тёмная',
      system: 'Системная',
    },
    breadcrumb: {
      root: 'Ваши Life Roadmaps',
    },
    tooltip: {
      signIn: 'Войти в аккаунт',
      signOut: 'Выйти из аккаунта',
      telegram: 'Telegram автора',
      github: 'Проект на GitHub',
      removePriority: 'Убрать приоритет',
      priority: 'Приоритетная задача',
    },
  },
};

let currentLanguage: Language = 'en'; // По умолчанию английский

// Получить текущий язык
export function getLanguage(): Language {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language') as Language | null;
    if (stored && (stored === 'ru' || stored === 'en')) {
      currentLanguage = stored;
      return stored;
    }
  }
  return currentLanguage;
}

// Установить язык
export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', lang);
  }
}

// Получить локализованную строку (поддержка вложенных ключей)
// Эта функция теперь использует глобальное состояние языка
export function t(key: string): string {
  const lang = getLanguage();
  const keys = key.split('.');
  let value: any = i18n[lang];
  for (const k of keys) {
    value = value?.[k];
  }
  return value || key;
}

// Хук для реактивного получения перевода (используется в компонентах)
// Должен использоваться внутри LanguageProvider
export function useTranslation() {
  const { language } = useLanguage();
  
  return useMemo(() => {
    return (key: string): string => {
      const keys = key.split('.');
      let value: any = i18n[language as Language];
      for (const k of keys) {
        value = value?.[k];
      }
      return value || key;
    };
  }, [language]);
}
