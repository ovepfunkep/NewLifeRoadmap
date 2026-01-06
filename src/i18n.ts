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
      steps: 'Tasks',
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
      addStep: 'T - Add task',
      edit: 'E - Edit current map',
      move: 'M - Move',
      import: 'I - Import',
      delete: 'D - Delete',
      complete: 'Enter - Complete',
      crtlNumber: 'CTRL + Number - Go to breadcrumb',
      number: 'Number - Go to task',
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
      noDeadlinesNested: 'No deadlines in nested tasks',
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
      syncChecking: 'Checking data synchronization...',
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
    footer: {
      refreshMemory: 'Refresh memory',
    },
    telegram: {
      title: 'Telegram Notifications',
      linking: 'Link Telegram',
      linked: 'Telegram Linked',
      remindMe: 'Remind me',
      beforeDeadline: 'before deadline',
      hours: 'hours',
      days: 'days',
      addReminder: 'Add reminder',
      noTelegram: 'Link Telegram in settings to receive notifications',
      enhancedSecurityNote: 'Note: Title decryption is only available in "Standard Protection" mode.',
      errorTooLate: 'Reminder must be at least 1 hour before deadline',
      errorPast: 'This reminder time has already passed',
      errorDuplicate: 'This reminder already exists',
      modalInfo1: 'To receive notifications, you need to link your Telegram account.',
      modalWarningTitle: 'Important Information:',
      modalInfo2: 'Linking happens when you press the "START" button in our bot.',
      modalInfo3: 'Due to the free hosting solution, notifications may be delayed by up to 20 minutes.',
      modalInfo4: 'We will send reminders in advance to ensure you don’t miss anything.',
      openBot: 'Open Telegram',
    },
    auth: {
      requiredTitle: 'Authentication Required',
      requiredInfo: 'Notifications are only available to authorized users for Telegram synchronization.',
      signInGoogle: 'Sign in with Google',
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
      steps: 'Задачи',
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
      addStep: 'T - Добавить задачу',
      edit: 'E - Редактировать текущую мапу',
      move: 'M - Переместить',
      import: 'I - Импорт',
      delete: 'D - Удалить',
      complete: 'Enter - Выполнить',
      crtlNumber: 'CTRL + Цифра - Переход к крошке',
      number: 'Цифра - Переход к задаче',
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
      noDeadlinesNested: 'Нет дедлайнов во вложенных задачах',
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
      syncChecking: 'Проверка синхронизации данных...',
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
    footer: {
      refreshMemory: 'Освежим память',
    },
    telegram: {
      title: 'Уведомления в Telegram',
      linking: 'Привязать Telegram',
      linked: 'Telegram привязан',
      remindMe: 'Напомнить за',
      beforeDeadline: 'до дедлайна',
      hours: 'часа(ов)',
      days: 'дня(ей)',
      addReminder: 'Добавить напоминание',
      noTelegram: 'Привяжите Telegram в настройках для получения уведомлений',
      enhancedSecurityNote: 'В режиме "Усиленная защита" названия задач в уведомлениях не отображаются.',
      errorTooLate: 'Напоминание должно быть минимум за 1 час до дедлайна',
      errorPast: 'Время этого напоминания уже прошло',
      errorDuplicate: 'Такое напоминание уже есть',
      modalInfo1: 'Для получения уведомлений необходимо привязать ваш Telegram аккаунт.',
      modalWarningTitle: 'Важная информация:',
      modalInfo2: 'Привязка происходит при нажатии кнопки "START" в нашем боте.',
      modalInfo3: 'В силу бесплатного решения уведомления могут приходить с задержкой до 20 минут.',
      modalInfo4: 'Мы будем отправлять уведомления заранее, чтобы вы точно ничего не пропустили.',
      openBot: 'Открыть Telegram',
    },
    auth: {
      requiredTitle: 'Требуется вход',
      requiredInfo: 'Уведомления доступны только авторизованным пользователям для синхронизации с Telegram.',
      signInGoogle: 'Войти через Google',
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
