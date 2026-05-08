# LifeRoadmap

**LifeRoadmap** — offline-first PWA для иерархических дорожных карт и задач с синхронизацией, E2EE и фокусом на личное планирование.

## Ключевые возможности

- **Иерархия задач любой глубины** (`parentId` + реконструкция дерева в UI).
- **Offline-first режим**: приложение полноценно работает локально через IndexedDB.
- **Синхронизация с облаком** (Firebase) с разрешением конфликтов.
- **E2EE и режимы приватности** (Standard / Enhanced).
- **Планирование времени**:
  - дедлайны и календарный режим,
  - регулярные задачи (daily/weekly/monthly),
  - недельный таймлайн занятости на 7 дней вперед,
  - поддержка временных интервалов и предупреждения о пересечениях.
- **Telegram-напоминания** и фоновые workflow-скрипты.
- **Импорт/экспорт веток** в JSON.

## Технологический стек

- React 18 + TypeScript + Vite
- TailwindCSS + Framer Motion
- IndexedDB (`idb`) + Firebase Firestore/Auth
- Web Crypto API (AES-GCM)
- Vitest
- GitHub Actions (CI/CD + scheduled jobs)

## Быстрый старт

```bash
npm ci
cp .env.example .env
npm run dev
```

Локально: `http://localhost:5173`

Проверка перед коммитом:

```bash
npm run verify
```

## Архитектурный срез

- **Локальный слой данных**: `src/db.ts`
- **Модель домена**: `src/types.ts`
- **Синк и нормализация Firestore**: `src/firebase/sync.ts`
- **Сравнение и значимость конфликтов**: `src/utils/syncCompare.ts`
- **Слоты расписания/регулярности**: `src/utils/recurrence.ts`
- **UI и оркестрация**: `src/components/`**, `src/pages/`**

## Документация

- [Development guide](./docs/DEVELOPMENT.md)
- [Architecture overview](./docs/ARCHITECTURE.md)
- [Firebase setup](./FIREBASE_SETUP.md)
- [Agent guide](./AGENTS.md)
- [Project report (expanded)](./docs/PROJECT_REPORT.md)

## Инфраструктура и процессы

- Deploy: GitHub Pages (`.github/workflows/deploy.yml`)
- CI-проверки (`tests + build`): `.github/workflows/ci.yml`
- Scheduled notifications: `.github/workflows/notify.yml`

## Лицензия

Распространяется по [лицензии MIT](LICENSE) (Copyright © Тябин Иван Алексеевич).

## Статус

Проект находится в активной разработке, с упором на:

- стабильность модели данных и синхронизации,
- предсказуемый UX планирования,
- AI-ready workflow для ускорения развития без деградации качества.

