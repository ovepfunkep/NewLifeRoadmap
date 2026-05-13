# Runbook: продакшен, инциденты, стоимость

Краткая памятка для владельца проекта. Детальный аудит: [PRODUCTION_SECURITY_ANALYSIS.md](PRODUCTION_SECURITY_ANALYSIS.md).

## 1. Бюджеты и алерты GCP (P0)

1. [Google Cloud Console](https://console.cloud.google.com/) → выберите проект Firebase → **Billing** → **Budgets & alerts**.
2. Создайте бюджет на месяц с порогами 50% / 90% / 100% и email-уведомления.
3. В **Firebase Console** → **Usage** / **Firestore** следите за ростом reads после релизов и вирусного трафика.

При **resource-exhausted** клиент уже может показывать тосты; пользователям сообщите о временных ограничениях.

## 2. Публикация правил Firestore = репозиторий

- Источник правды: корневой файл [`firestore.rules`](../firestore.rules).
- После правок: `firebase deploy --only firestore:rules` или вставка в консоли и **Publish**.
- Перед релизом: сравнить опубликованные правила с файлом в git (или деплоить только из CI с тем же коммитом).

## 3. Режим обслуживания (полный deny)

Инструкция в комментарии внизу [`firestore.rules`](../firestore.rules): заменить тело `service cloud.firestore` на `match /{document=**} { allow read, write: if false; }`, опубликовать.

UI: одноразовые модалки недоступности / восстановления ([`src/utils/cloudFirestoreHealth.ts`](../src/utils/cloudFirestoreHealth.ts)).

## 4. App Check

- Клиент: опциональная инициализация через env (см. [FIREBASE_SETUP.md](../FIREBASE_SETUP.md) раздел App Check).
- После стабилизации трафика можно **усилить правила** проверкой `request.app` (пример закомментирован в `firestore.rules`). До включения убедитесь, что все клиенты получают валидный App Check token.

## 5. Аномальный uid (злоупотребление или баг)

Жёсткий дневной лимит reads **только в Security Rules** задать нельзя; варианты:

- Временно отключить пользователю доступ через **Custom Claims** + правила (нужен Admin SDK / Cloud Function).
- Или блокировка на уровне поддержки Google при злоупотреблении аккаунтом.

Скрипт с Admin SDK держите вне публичного репозитория (сервисный ключ не коммитить).

## 6. Наплыв на статику (GitHub Pages)

- GitHub Pages сам по себе не даёт WAF/CSP; при росте трафика рассмотрите CDN (например Cloudflare) перед origin — см. [CDN_AND_HEADERS.md](CDN_AND_HEADERS.md).

## 7. Контакты и эскалация

Заполните под себя: ответственный за биллинг, за Firebase project, канал оповещений.
