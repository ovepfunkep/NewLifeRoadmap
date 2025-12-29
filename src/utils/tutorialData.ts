import { Node } from '../types';
import { generateId } from '../utils';

// We intentionally keep tutorial data unprotected: user can edit/delete it freely.

function setParentIds(nodes: Node[], parentId: string | null): void {
  for (const node of nodes) {
    node.parentId = parentId;
    if (node.children.length > 0) setParentIds(node.children, node.id);
  }
}

type TutorialNodeInput = {
  title: string;
  description?: string;
  parentId?: string | null;
  deadline?: string | null;
  priority?: boolean;
  order?: number;
  children?: Node[];
};

function makeBaseNode(partial: TutorialNodeInput, now: string): Node {
  return {
    id: generateId(),
    parentId: partial.parentId ?? null,
    title: partial.title,
    description: partial.description,
    deadline: partial.deadline ?? null,
    completed: false,
    priority: partial.priority,
    order: partial.order,
    createdAt: now,
    updatedAt: now,
    children: partial.children ?? [],
  };
}

export function generateTutorial(lang: 'ru' | 'en', isMobile: boolean = false): Node[] {
  const now = new Date().toISOString();

  if (lang === 'ru') {
    const ru: Node[] = [
      makeBaseNode(
        {
          parentId: 'root-node',
          title: 'Кликни на меня, если понимаешь этот язык!',
          description:
            'Привет. Да, это туториал. Нет, это не «ещё один скучный туториал». ' +
            'Давай я быстро покажу фишки — а потом ты уже будешь командовать этой жизнью как босс.',
          children: [
            makeBaseNode(
              {
                title: 'Кликни сюда, чтобы начать туториал',
                description:
                  'Окей, начинаем. Сначала — ориентирование: где название, где описание, и как тут отмечать выполненное. ' +
                  'Я наблюдаю. Но не осуждаю.',
                children: [
                  makeBaseNode({
                    title: '1) Прочитай описание под названием сверху',
                    description: 'То что в самом верху, а не это. Да-да, я тоже сначала читаю не туда.',
                  }, now),
                  makeBaseNode({
                    title: '2) Конфетти за выполнения',
                    description:
                      'Отметь выполненными задания 1 и 2 (галочка рядом). ' +
                      'Если конфетти не включено — включи эффекты в настройках (шестерёнка).',
                  }, now),
                  makeBaseNode(
                    {
                      title: '3) Дальше будет интересно. Обещаю.',
                      description:
                        'Теперь умеем: читать, отмечать, радоваться. Переходим к созданию и управлению задачами.\n\n' +
                        'P.S. Перед этим — кастомизируй всё под себя: шестерёнка → тема/акцент/эффекты. ' +
                        'Да, можно выключить снег. Нет, я не скажу «зачем», но можно.',
                      children: [
                        makeBaseNode({
                          title: 'Создай подзадачу',
                          description: isMobile 
                            ? 'Нажми плюсик сверху. Любое великое дело начинается с маленького шага. Даже «купить хлеб».'
                            : 'Нажми плюсик сверху или клавишу T. Любое великое дело начинается с маленького шага. Даже «купить хлеб».',
                        }, now),
                        makeBaseNode({
                          title: 'Закрепи приоритет',
                          description: isMobile
                            ? 'Свайпай кнопку действия в карточке, пока не увидишь стрелочку вверх, и нажми её. Теперь задача будет сверху.'
                            : 'Нажми на стрелочку/иконку приоритета у задачи. Теперь она будет сверху. Как и должна.',
                        }, now),
                        makeBaseNode({
                          title: 'Отредактируй задачу',
                          description: isMobile
                            ? 'Свайпай кнопку действия в карточке до иконки карандаша. Сделай название нормальным. Или хотя бы честным.'
                            : 'Карандашик или клавиша E. Сделай название нормальным. Или хотя бы честным.',
                        }, now),
                        makeBaseNode({
                          title: 'Добавь дедлайн',
                          description: 'В редакторе добавь дату и (если надо) время. Потом посмотри вправо (или вверх на мобилке): там список/календарь дедлайнов.',
                        }, now),
                        makeBaseNode({
                          title: 'Проверь календарь дедлайнов',
                          description: 'Переключи вид на календарный. Там должны быть ВСЕ задачи с дедлайнами.',
                        }, now),
                        makeBaseNode({
                          title: 'Окей. Теперь — следующая глава',
                          description: isMobile
                            ? 'Нажми кнопку «Назад» в заголовке — и не забудь отметить этот шаг выполненным. Да, я проверю. Ну почти.'
                            : 'Нажми Esc, чтобы вернуться назад — и не забудь отметить этот шаг выполненным. Да, я проверю. Ну почти.',
                        }, now),
                      ],
                    },
                    now
                  ),
                  makeBaseNode(
                    {
                      title: '4) Навигация',
                      description: isMobile ? 'На телефоне всё просто — тапай и скролль.' : 'Ладно, клики — это мило. Но мы же не в каменном веке.',
                      children: isMobile ? [
                        makeBaseNode({
                          title: 'Хлебные крошки',
                          description: 'Нажимай на путь сверху, чтобы быстро вернуться на любой уровень назад.',
                        }, now),
                      ] : [
                        makeBaseNode({
                          title: 'Цифры 1–9',
                          description: 'Нажми цифру 1–9, чтобы перейти к соответствующей карточке в списке.',
                        }, now),
                        makeBaseNode({
                          title: 'Esc',
                          description: 'Esc → на уровень выше. Спасает, когда ты «случайно» ушёл слишком глубоко.',
                        }, now),
                        makeBaseNode({
                          title: 'Ctrl + цифра',
                          description: 'Ctrl + 1..9 → переход по хлебным крошкам (верхняя навигация). Очень быстро, очень красиво.',
                        }, now),
                      ],
                    },
                    now
                  ),
                  makeBaseNode(
                    {
                      title: '5) Организация: перенос, драг-н-дроп, импорт',
                      description:
                        'Тут ты начнёшь чувствовать власть.\n\n' +
                        'Важно: синхронизация/сервер — только если ты залогинен(а).',
                      children: [
                        makeBaseNode({
                          title: 'Перенос (M)',
                          description: isMobile
                            ? 'Свайпай кнопку действия до иконки папки. Выбери куда переместить текущую мапу/папку.'
                            : 'Нажми M → выбери куда переместить текущую мапу/папку. Удобно, когда структура огромная.',
                        }, now),
                        makeBaseNode({
                          title: 'Drag & Drop',
                          description: 'Перетащи карточку на другую карточку или в хлебные крошки сверху. Да, прям так.',
                        }, now),
                        makeBaseNode({
                          title: 'Импорт/Экспорт (I)',
                          description: isMobile
                            ? 'Используй меню в заголовке для импорта и экспорта. Сохрани бэкап. Иногда жизнь любит сюрпризы.'
                            : 'Нажми I. Сохрани бэкап. Или импортируй. Иногда жизнь любит сюрпризы — пусть хотя бы данные будут под контролем.',
                        }, now),
                        makeBaseNode({
                          title: 'Удаление (D)',
                          description: isMobile
                            ? 'Свайпай кнопку до корзины. Уничтожать ветки задач без предупреждения — это не наш стиль.'
                            : 'Нажми D — появится красивое подтверждение. Уничтожать ветки задач без предупреждения — это не наш стиль.',
                        }, now),
                        makeBaseNode({
                          title: 'Выполнить',
                          description: isMobile
                            ? 'Кнопка с галочкой в карточке — твой главный инструмент успеха.'
                            : 'Enter или кнопка с галочкой → выполнить текущую мапу/задачу. Простой кайф.',
                        }, now),
                      ],
                    },
                    now
                  ),
                  makeBaseNode(
                    {
                      title: '6) Финал: Архив',
                      description:
                        'Ты молодец. Теперь создай папку «Архив» и перетащи туда этот туториал. ' +
                        'А дальше — уже твоя карта жизни. Я не плачу. Это просто снег в глаза.',
                    },
                    now
                  ),
                ],
              },
              now
            ),
          ],
        },
        now
      ),
    ];

    setParentIds(ru, 'root-node');
    return ru;
  }

  const en: Node[] = [
    makeBaseNode(
      {
        parentId: 'root-node',
        title: 'Click me if you understand this language!',
        description:
          'Hi. Yes, this is a tutorial. No, it’s not a boring one. ' +
          'Give me a minute and you’ll drive this app like you own it.',
        children: [
          makeBaseNode(
            {
              title: 'Click here to start the tutorial',
              description:
                'Alright. First: orientation — where title/description live, and how completion works. ' +
                'I’m watching. But I’m not judging.',
              children: [
                makeBaseNode({
                  title: '1) Read the description under the page title',
                  description: 'The one at the very top. Not this one. Yes, you did look here first. Don’t lie.',
                }, now),
                makeBaseNode({
                  title: '2) Earn the confetti',
                  description:
                    'Complete tasks 1 and 2 (use the checkbox). ' +
                    'If confetti is off — enable effects in settings (the gear icon).',
                }, now),
                makeBaseNode(
                  {
                    title: '3) Now the fun part.',
                    description:
                      'Now you can read, complete, celebrate. Time to create and control tasks.\n\n' +
                      'P.S. Customize first: gear → theme/accent/effects. ' +
                      'Yes, you can turn off snow. No, I won’t ask why.',
                    children: [
                      makeBaseNode({
                        title: 'Create a subtask',
                        description: isMobile
                          ? 'Click the plus button at the top. Every big plan starts with a small step.'
                          : 'Click the plus button or press T. Every big plan starts with a small step. Even “buy bread”.',
                      }, now),
                      makeBaseNode({
                        title: 'Pin priority',
                        description: isMobile
                          ? 'Swipe the action button in the card until you see the up arrow and tap it. It will stay on top.'
                          : 'Toggle priority on the task. It stays on top. As it should.',
                      }, now),
                      makeBaseNode({
                        title: 'Edit a task',
                        description: isMobile
                          ? 'Swipe the action button to the pencil icon. Make the title sharp. Or at least honest.'
                          : 'Pencil icon or press E. Make the title sharp. Or at least honest.',
                      }, now),
                      makeBaseNode({
                        title: 'Add a deadline',
                        description: 'In the editor, set date (and time if needed). Then look right (or top on mobile): deadlines list/calendar.',
                      }, now),
                      makeBaseNode({
                        title: 'Check the deadline calendar',
                        description: 'Switch the right panel to calendar view. It should show ALL tasks with deadlines.',
                      }, now),
                      makeBaseNode({
                        title: 'Alright. Next chapter',
                        description: isMobile
                          ? 'Click the "Back" button in the header — and don’t forget to mark this step as completed.'
                          : 'Press Esc to go back — and don’t forget to mark this step as completed. Yes, I’m watching. Kinda.',
                      }, now),
                    ],
                  },
                  now
                ),
                makeBaseNode(
                  {
                    title: '4) Navigation',
                    description: isMobile ? 'On mobile it is simple — just tap and scroll.' : 'Clicks are cute. Hotkeys are power.',
                    children: isMobile ? [
                      makeBaseNode({
                        title: 'Breadcrumbs',
                        description: 'Tap the path at the top to quickly jump back to any level.',
                      }, now),
                    ] : [
                      makeBaseNode({
                        title: 'Numbers 1–9',
                        description: 'Press 1–9 to jump to the corresponding card in the list.',
                      }, now),
                      makeBaseNode({
                        title: 'Esc',
                        description: 'Esc → go one level up. Useful when you “accidentally” go too deep.',
                      }, now),
                      makeBaseNode({
                        title: 'Ctrl + number',
                        description: 'Ctrl + 1..9 → jump via breadcrumbs (top path). Fast and clean.',
                      }, now),
                    ],
                  },
                  now
                ),
                makeBaseNode(
                  {
                    title: '5) Organization: move, drag & drop, import',
                    description:
                      'This is where you start feeling powerful.\n\n' +
                      'Important: cloud/server communication happens only when you’re logged in.',
                    children: [
                      makeBaseNode({
                        title: 'Move (M)',
                        description: isMobile
                          ? 'Swipe the action button to the folder icon. Pick a target for the current node/folder.'
                          : 'Press M → pick a target. Great for big structures.',
                      }, now),
                      makeBaseNode({
                        title: 'Drag & Drop',
                        description: 'Drag a card onto another card or into breadcrumbs. Yes, literally.',
                      }, now),
                      makeBaseNode({
                        title: 'Import/Export (I)',
                        description: isMobile
                          ? 'Use the header menu for import and export. Make backups. Future-you will thank you.'
                          : 'Press I. Make backups. Or import. Sometimes life loves surprises — at least your data will be safe.',
                      }, now),
                      makeBaseNode({
                        title: 'Delete (D)',
                        description: isMobile
                          ? 'Swipe the button to the trash icon. We don’t do silent disasters here.'
                          : 'Press D → you’ll get a nice confirmation. We don’t do silent disasters here.',
                      }, now),
                      makeBaseNode({
                        title: 'Complete',
                        description: isMobile
                          ? 'The checkmark button in the card is your main tool for success.'
                          : 'Enter or the checkmark button → complete current node. Clean, simple, satisfying.',
                      }, now),
                    ],
                  },
                  now
                ),
                makeBaseNode(
                  {
                    title: '6) Finale: Archive',
                    description:
                      'Create an “Archive” folder and move this tutorial there. ' +
                      'Then build your real life map. I’m not emotional. It’s just snow in my eyes.',
                  },
                  now
                ),
              ],
            },
            now
          ),
        ],
      },
      now
    ),
  ];

  setParentIds(en, 'root-node');
  return en;
}