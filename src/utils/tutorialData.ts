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

export function generateTutorial(lang: 'ru' | 'en'): Node[] {
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
                          description: 'Нажми плюсик сверху или клавишу T. Любое великое дело начинается с маленького шага. Даже «купить хлеб».',
                        }, now),
                        makeBaseNode({
                          title: 'Закрепи приоритет',
                          description: 'Нажми на стрелочку/иконку приоритета у задачи. Теперь она будет сверху. Как и должна.',
                        }, now),
                        makeBaseNode({
                          title: 'Отредактируй задачу',
                          description: 'Карандашик или клавиша E. Сделай название нормальным. Или хотя бы честным.',
                        }, now),
                        makeBaseNode({
                          title: 'Добавь дедлайн',
                          description: 'В редакторе добавь дату и (если надо) время. Потом посмотри вправо: там список/календарь дедлайнов.',
                        }, now),
                        makeBaseNode({
                          title: 'Проверь календарь дедлайнов',
                          description: 'Переключи вид справа на календарный. Там должны быть ВСЕ задачи с дедлайнами.',
                        }, now),
                        makeBaseNode({
                          title: 'Окей. Теперь — следующая глава',
                          description: 'Нажми Esc, чтобы вернуться назад — и не забудь отметить этот шаг выполненным. Да, я проверю. Ну почти.',
                        }, now),
                      ],
                    },
                    now
                  ),
                  makeBaseNode(
                    {
                      title: '4) Навигация для быстрых',
                      description: 'Ладно, клики — это мило. Но мы же не в каменном веке.',
                      children: [
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
                          description: 'Нажми M → выбери куда переместить текущую мапу/папку. Удобно, когда структура огромная.',
                        }, now),
                        makeBaseNode({
                          title: 'Drag & Drop',
                          description: 'Перетащи карточку на другую карточку или в хлебные крошки сверху. Да, прям так.',
                        }, now),
                        makeBaseNode({
                          title: 'Импорт/Экспорт (I)',
                          description: 'Нажми I. Сохрани бэкап. Или импортируй. Иногда жизнь любит сюрпризы — пусть хотя бы данные будут под контролем.',
                        }, now),
                        makeBaseNode({
                          title: 'Удаление (D)',
                          description:
                            'Нажми D — появится красивое подтверждение. ' +
                            'Уничтожать ветки задач без предупреждения — это не наш стиль.',
                        }, now),
                        makeBaseNode({
                          title: 'Выполнить (Enter)',
                          description: 'Enter → выполнить текущую мапу/задачу. Простой кайф.',
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
                  makeBaseNode(
                    {
                      title: 'Бонус: 3 готовых шаблона (чтобы не изобретать велосипед)',
                      description:
                        'Хочешь быстро увидеть “как правильно”? Вот три сценария, которые обычно заходят людям.\n' +
                        'Можешь просто скопировать структуру и потом удалить этот блок (без жалости).',
                      children: [
                        makeBaseNode(
                          {
                            title: 'Шаблон 1 — Проект (запуск / ремонт / обучение)',
                            description:
                              'Как пользоваться: создай папку проекта → внутри этапы → внутри шаги. ' +
                              'Ставь дедлайны этапам, приоритет — тем, что “горит”.',
                            children: [
                              makeBaseNode({ title: 'Цель проекта (1 строка)', description: 'Что считаем успехом? Пиши коротко. Потом спасибо скажешь.' }, now),
                              makeBaseNode({ title: 'Этап 1: Подготовка', description: 'Сюда: исследования, список ресурсов, бюджет, список рисков.' }, now),
                              makeBaseNode({ title: 'Этап 2: Реализация', description: 'Конкретные задачи. Лучше маленькие, чем “сделать всё”.' }, now),
                              makeBaseNode({ title: 'Этап 3: Проверка', description: 'Чек-лист, тест, финальная правка. Да, это важно.' }, now),
                              makeBaseNode({ title: 'Этап 4: Релиз', description: 'Публикация / сдача / отправка. И празднуем (с конфетти).' }, now),
                            ],
                          },
                          now
                        ),
                        makeBaseNode(
                          {
                            title: 'Шаблон 2 — Папка знаний (важные тексты и ссылки)',
                            description:
                              'Это твой “сейф”. Делай папку и храни внутри заметки в описаниях задач. ' +
                              'Структура должна быть простой, чтобы находить за 10 секунд.',
                            children: [
                            makeBaseNode({ title: 'Личные заметки (безопасно)', description: 'Всё, что важно помнить, но не обязательно держать в голове. Твои данные шифруются.' }, now),
                              makeBaseNode({ title: 'Шаблоны текстов', description: 'Письма, сообщения, ответы, резюме. Всё, что ты устал(а) писать заново.' }, now),
                              makeBaseNode({ title: 'Личные правила', description: 'Твои принципы/границы/решения. Когда мозг устал — это спасает.' }, now),
                              makeBaseNode({ title: 'Ссылки/ресурсы', description: 'Курсы, статьи, каналы. И коротко: зачем эта ссылка вообще нужна.' }, now),
                            ],
                          },
                          now
                        ),
                        makeBaseNode(
                          {
                            title: 'Шаблон 3 — Привычки и здоровье (без токсичного оптимизма)',
                            description:
                              'Тут удобно вести трек “микро-шагов”. Дедлайны — как напоминания, приоритет — как фокус.\n' +
                              'Главное правило: меньше геройства, больше повторяемости.',
                            children: [
                              makeBaseNode({ title: 'Сон', description: 'Режим, вечерний ритуал, “что мешает” — фиксируй честно.' }, now),
                              makeBaseNode({ title: 'Движение', description: '10–20 минут — уже победа. Делай шаги максимально простыми.' }, now),
                              makeBaseNode({ title: 'Питание', description: 'Не диета. Просто система: вода, базовые продукты, план на неделю.' }, now),
                              makeBaseNode({ title: 'Психика', description: 'Отдых, прогулка, дневник. Что реально помогает именно тебе.' }, now),
                            ],
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
                        description: 'Click the plus button or press T. Every big plan starts with a small step. Even “buy bread”.',
                      }, now),
                      makeBaseNode({
                        title: 'Pin priority',
                        description: 'Toggle priority on the task. It stays on top. As it should.',
                      }, now),
                      makeBaseNode({
                        title: 'Edit a task',
                        description: 'Pencil icon or press E. Make the title sharp. Or at least honest.',
                      }, now),
                      makeBaseNode({
                        title: 'Add a deadline',
                        description: 'In the editor, set date (and time if needed). Then look right: deadlines list/calendar.',
                      }, now),
                      makeBaseNode({
                        title: 'Check the deadline calendar',
                        description: 'Switch the right panel to calendar view. It should show ALL tasks with deadlines.',
                      }, now),
                      makeBaseNode({
                        title: 'Alright. Next chapter',
                        description: 'Press Esc to go back — and don’t forget to mark this step as completed. Yes, I’m watching. Kinda.',
                      }, now),
                    ],
                  },
                  now
                ),
                makeBaseNode(
                  {
                    title: '4) Navigation for fast hands',
                    description: 'Clicks are cute. Hotkeys are power.',
                    children: [
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
                        description: 'Press M → pick a target. Great for big structures.',
                      }, now),
                      makeBaseNode({
                        title: 'Drag & Drop',
                        description: 'Drag a card onto another card or into breadcrumbs. Yes, literally.',
                      }, now),
                      makeBaseNode({
                        title: 'Import/Export (I)',
                        description: 'Press I. Make backups. Future-you will thank you.',
                      }, now),
                      makeBaseNode({
                        title: 'Delete (D)',
                        description: 'Press D → you’ll get a nice confirmation. We don’t do silent disasters here.',
                      }, now),
                      makeBaseNode({
                        title: 'Complete (Enter)',
                        description: 'Enter → complete current node. Clean, simple, satisfying.',
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
                makeBaseNode(
                  {
                    title: 'Bonus: 3 ready-to-use templates (so you don’t reinvent the wheel)',
                    description:
                      'Want to see a “best practice” structure? Here are three popular scenarios.\n' +
                      'Copy the structure, then delete this block when you’re done (no mercy needed).',
                    children: [
                      makeBaseNode(
                        {
                          title: 'Template 1 — A Project (launch / renovation / learning)',
                          description:
                            'How to use: create a project folder → stages → tasks. ' +
                            'Add deadlines to stages, set priority on what’s actually urgent.',
                          children: [
                            makeBaseNode({ title: 'Project goal (1 sentence)', description: 'Define what “done” means. Future-you will thank you.' }, now),
                            makeBaseNode({ title: 'Stage 1: Preparation', description: 'Research, resources, budget, risks.' }, now),
                            makeBaseNode({ title: 'Stage 2: Execution', description: 'Concrete tasks. Smaller is better than “do everything”.' }, now),
                            makeBaseNode({ title: 'Stage 3: Review', description: 'Checklist, tests, final edits. Yes, it matters.' }, now),
                            makeBaseNode({ title: 'Stage 4: Release', description: 'Ship it / submit it / send it. Then celebrate (confetti-approved).' }, now),
                          ],
                        },
                        now
                      ),
                      makeBaseNode(
                        {
                          title: 'Template 2 — Knowledge Vault (important text & links)',
                          description:
                            'This is your “safe”. Create a folder and store notes inside task descriptions. ' +
                            'Keep it simple so you can find anything in 10 seconds.',
                          children: [
                            makeBaseNode({ title: 'Personal notes (safely)', description: 'Important stuff to remember. Your data is encrypted for your eyes only.' }, now),
                            makeBaseNode({ title: 'Text templates', description: 'Emails, messages, responses, CV snippets. Stop rewriting the same thing.' }, now),
                            makeBaseNode({ title: 'Personal rules', description: 'Your principles/boundaries/decisions. Great when your brain is tired.' }, now),
                            makeBaseNode({ title: 'Resources', description: 'Courses, articles, channels. Add a short “why this matters” note.' }, now),
                          ],
                        },
                        now
                      ),
                      makeBaseNode(
                        {
                          title: 'Template 3 — Habits & Health (no toxic positivity)',
                          description:
                            'Great for micro-steps. Deadlines as reminders, priority as focus.\n' +
                            'Rule: less hero mode, more consistency.',
                          children: [
                            makeBaseNode({ title: 'Sleep', description: 'Routine, wind-down, what breaks it. Be honest.' }, now),
                            makeBaseNode({ title: 'Movement', description: '10–20 minutes counts. Make the steps ridiculously doable.' }, now),
                            makeBaseNode({ title: 'Nutrition', description: 'Not a diet—just a system: water, basics, weekly plan.' }, now),
                            makeBaseNode({ title: 'Mind', description: 'Rest, walking, journaling. What actually helps *you*.' }, now),
                          ],
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
        ],
      },
      now
    ),
  ];

  setParentIds(en, 'root-node');
  return en;
}