# Инструкция по настройке Firebase

## Шаг 1: Создание проекта Firebase

1. Перейдите на [Firebase Console](https://console.firebase.google.com/)
2. Нажмите "Add project" (Добавить проект)
3. Введите название проекта (например, `liferoadmap`)
4. Отключите Google Analytics (не обязательно для тестирования)
5. Нажмите "Create project"

## Шаг 2: Включение Authentication

1. В боковом меню выберите **Authentication**
2. Нажмите "Get started"
3. Перейдите на вкладку **Sign-in method**
4. Нажмите на **Google**
5. Включите переключатель "Enable"
6. Выберите email проекта (или создайте новый)
7. Нажмите "Save"

## Шаг 3: Создание Firestore Database

1. В боковом меню выберите **Firestore Database**
2. Нажмите "Create database"
3. Выберите режим **Test mode** (для начала)
4. Выберите регион (например, `us-central`)
5. Нажмите "Enable"

⚠️ **Важно**: После настройки правил безопасности смените режим на Production mode.

## Шаг 4: Получение конфигурации

1. В боковом меню выберите **Project Settings** (⚙️)
2. Прокрутите вниз до раздела **Your apps**
3. Нажмите на иконку веб-приложения (`</>`) или "Add app" → Web
4. Введите название приложения (например, `liferoadmap-web`)
5. Нажмите "Register app"
6. Скопируйте значения из объекта `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Шаг 5: Настройка переменных окружения

1. Скопируйте файл `.env.example` в `.env`:
  ```bash
   cp .env.example .env
  ```
2. Откройте `.env` и заполните значения из Firebase:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

## Шаг 6: Настройка правил безопасности Firestore

Источник правды в репозитории: файл [`firestore.rules`](firestore.rules) (включает пути `nodes`, `settings`, `security` для синка и ключей).

1. Откройте файл и при необходимости скорректируйте под свой проект.
2. В [Firebase Console](https://console.firebase.google.com/) → **Firestore Database** → **Rules** вставьте содержимое `firestore.rules` (без комментария «РЕЖИМ ОБСЛУЖИВАНИЯ» внизу — это справка) и нажмите **Publish**.

Либо из корня проекта (при установленном [Firebase CLI](https://firebase.google.com/docs/cli)):

```bash
firebase deploy --only firestore:rules
```

(используется [`firebase.json`](firebase.json).)

**Режим обслуживания:** в конце `firestore.rules` в комментарии описан вариант с `allow read, write: if false` для всей БД — временно замените правила этим блоком и опубликуйте; данные не удаляются. Клиент покажет одноразовую модалку о недоступности облака (см. `docs/ARCHITECTURE.md`).

## Шаг 7: Проверка работы

1. Запустите приложение:
  ```bash
   npm run dev
  ```
2. В правом верхнем углу нажмите "Войти через Google"
3. Выберите Google аккаунт
4. После входа данные должны синхронизироваться

## Устранение проблем

### Ошибка "Firebase config is missing"

- Проверьте, что файл `.env` существует и содержит все переменные
- Убедитесь, что переменные начинаются с `VITE_`
- Перезапустите dev-сервер после изменения `.env`

### Ошибка авторизации

- Убедитесь, что Google Sign-In включен в Firebase Console
- Проверьте, что домен добавлен в авторизованные домены (для production)

### Данные не синхронизируются

- Проверьте консоль браузера на ошибки
- Убедитесь, что правила Firestore настроены правильно
- Проверьте, что пользователь авторизован

## Для production (GitHub Pages)

Для production нужно добавить секреты в GitHub Actions:

1. Перейдите в Settings вашего репозитория на GitHub
2. Выберите **Secrets and variables** → **Actions**
3. Добавьте следующие секреты:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
4. Обновите `.github/workflows/deploy.yml` для использования этих секретов в `env`

