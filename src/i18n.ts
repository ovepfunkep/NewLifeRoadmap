import { Node, DeadlineStatus } from './types';

// Локализация (RU)
export const i18n: Record<string, any> = {
  general: {
    appName: 'LifeRoadmap',
    loading: 'Загрузка...',
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    edit: 'Редактировать',
    create: 'Создать',
    close: 'Закрыть',
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
  },
  theme: {
    light: 'Светлая',
    dark: 'Тёмная',
    system: 'Системная',
  },
  breadcrumb: {
    root: 'Ваши Life Roadmaps',
  },
};

// Получить локализованную строку (поддержка вложенных ключей)
export function t(key: string): string {
  const keys = key.split('.');
  let value: any = i18n;
  for (const k of keys) {
    value = value?.[k];
  }
  return value || key;
}
