# Полный анализ готовности к продакшену: безопасность, злоупотребления, данные

**Дата отчёта:** 2026-05-12  
**Режим:** только анализ репозитория и публичной архитектуры; **изменений коду не вносилось**.  
**Стек (из README / AGENTS):** React 18, TypeScript, Vite, Tailwind, Framer Motion, IndexedDB (`idb`), Firebase Auth + Firestore, Web Crypto (E2EE), GitHub Pages deploy.

---

## 1. Краткий вердикт

| Критерий | Оценка | Комментарий |
|----------|--------|---------------|
| Изоляция данных между пользователями | **Сильная** | Правила Firestore привязаны к `request.auth.uid == userId`. |
| Защита от «чужого чтения» без авторизации | **Да** | Всё вне разрешённых путей — `allow read, write: if false`. |
| Защита от злоумышленника **с валидным токеном жертвы** | **Слабая** (как у большинства SPA) | Любой XSS / украденная сессия = полный доступ к данным пользователя в Firestore. |
| Жёсткий лимит «N reads/день на uid» **только правилами Firestore** | **Невозможно** | Security Rules не ведут счётчик успешных reads и не могут атомарно отказать после порога без отдельного серверного слоя или прокси. |
| App Check / серверный rate limit | **Клиент:** App Check включается при заданном `VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` ([`src/firebase/config.ts`](../src/firebase/config.ts)); enforcement в Rules — вручную после стабилизации (см. комментарий в [`firestore.rules`](../firestore.rules)). Каталога `functions/` по-прежнему нет. |
| Операционная готовность (бюджеты GCP, runbook) | **Вне репозитория** | Нужно настроить в консоли Google Cloud / Firebase. |
| Секреты в CI | **Ок по шаблону** | `deploy.yml` тянет `VITE_*` из GitHub Secrets; в репо ключей нет. |

---

## 2. Модель угроз (релевантная продукту)

### 2.1 Злоумышленник без токена

- Прямой доступ к чужим `users/{uid}/...` **закрыт** правилами ([`firestore.rules`](../firestore.rules)).
- Массовый перебор document id **всё равно требует** аутентификации под чужим uid (невозможно без компрометации Auth) **или** уязвимости правил (здесь узкий матч).

### 2.2 Злоумышленник со своим аккаунтом («приколист»)

- Может вызывать SDK сколько угодно раз к **своему** поддереву `users/{hisUid}/...`.
- **Ваш биллинг** страдает так же, как при легитимной нагрузке сверх free tier.
- **Security Rules не ограничивают** частоту или дневной объём операций на uid.

### 2.3 Кража учётных данных / XSS

- Любой код в контексте страницы с доступом к `localStorage` может прочитать то, что там лежит.
- В [`src/firebase/auth.ts`](../src/firebase/auth.ts) при успешном Google sign-in токен кладётся в **`sessionStorage`** (узже окно XSS, чем `localStorage`; миграция со старого ключа в `localStorage` — [`src/utils/googleAccessToken.ts`](../src/utils/googleAccessToken.ts)). При XSS в той же вкладке риск сохраняется.

### 2.4 DDoS

| Слой | Кто защищает | Заметка |
|------|----------------|---------|
| Статика (HTML/JS/CSS) | GitHub Pages + опционально CDN | При вирусном трафике на **один URL** — риск для доступности и квот CDN; Firestore не обязательно затронут. |
| Firestore | Google квоты проекта + ваш счёт | Нет WAF «на Firestore» из репозитория; нужны App Check, бюджеты, реакция. |

### 2.5 Внутренние угрозы (баги клиента)

- Циклический sync, лишние `getDocs`, пересоздание `onSnapshot` на каждый focus — **множат reads** и стоят денег. В [`SyncManager`](../src/components/SyncManager.tsx) уже заложена экономия (комментарии про инкремент без пересоздания listener); **регрессии** здесь опасны.

---

## 3. Firestore Security Rules (детально)

Файл [`firestore.rules`](../firestore.rules), версия `2`:

- `match /users/{userId}/nodes/{nodeId}` — `read, write` если `request.auth != null && request.auth.uid == userId`.
- `match /users/{userId}/settings/{settingsId}` — то же.
- `match /users/{userId}/security/{document}` — то же (сюда попадают sync_meta, конфиг безопасности, **журнал изменений** по коду в `sync.ts`).
- `match /{document=**}` — **запрет** всего остального.

**Сильные стороны:** простота, нет широкого `get` по коллекции без uid в пути.  
**Слабые стороны:** нет ограничения размера документа, нет rate limit, нет проверки App Check (`request.app` не используется).

В конце файла задокументирован **режим обслуживания** (полный deny) — операционно полезно.

---

## 4. Аутентификация

Файл [`src/firebase/auth.ts`](../src/firebase/auth.ts):

- `signInWithPopup` + `GoogleAuthProvider`.
- Опциональный scope Drive для enhanced режима.
- `signOutUser` удаляет OAuth token из session/local storage ([`googleAccessToken`](../src/utils/googleAccessToken.ts)).

**Риски:**

1. **OAuth access token в localStorage** — долгоживущая поверхность для XSS (см. выше).
2. **Нет App Check** — другой сайт теоретически не прочитает Firestore без вашего API key + правильного origin для некоторых ограничений Google, но **скомпрометированный ключ в клиенте** всегда публичен; основная массовая защита от ботов на API — App Check + правила.

---

## 5. Поверхность Firestore: чтения и записи (файл `sync.ts`)

По [`src/firebase/sync.ts`](../src/firebase/sync.ts) (импорты `getDoc`, `getDocs`, `getDocsFromServer`, `onSnapshot`, `setDoc`, `writeBatch`):

| Функция / участок | Тип нагрузки | Комментарий |
|-------------------|--------------|---------------|
| `fetchChangeLogSincePage` | `getDocs` с `limit` | Постраничный drain журнала — разумно. |
| `subscribeToChangeLog` | `onSnapshot` | Живые чтения при новых записях журнала; важно не плодить подписки. |
| `cleanupChangeLog` | `getDocs` + batch delete | Снижает хвост storage; нагрузка bounded `limit`. |
| `getSyncMeta` | `getDoc` | Дёшево; используется для meta-check перед тяжёлым fetch. |
| `loadChangedNodesFromFirestore` | `getDocsFromServer` | Инкрементальные изменения узлов. |
| `syncAllNodesToFirestore` без переданного `cloudNodes` | **`getDocs` всей коллекции `nodes`** | **1 read на документ** в облаке; самый дорогой путь при большом дереве. |
| `loadAllNodesFromFirestore` | `getDocs` / `getDocsFromServer` | Полный снимок — для конфликта / full sync. |
| `loadNodeFromFirestore` | `getDoc` | Одиночный узел. |
| `hasDataInFirestore` | `getDocs` с query | Проверка «есть ли данные». |
| `writeChangeLog` | `setDoc` нового doc | Рост коллекции журнала; payload может быть крупным (шифрованные поля). |

**Инвариант продукта:** при вызове bulk sync **передавать уже загруженный** `cloudNodes` в `syncAllNodesToFirestore`, чтобы не делать второй полный `getDocs` — это уже отражено в архитектурной документации и коде вызовов; при новых фичах **не ломать**.

---

## 6. Лимит «5000 reads/день на пользователя» (Firestore billing)

**Требование пользователя (зафиксировано в планировании):** ограничивать именно **операции Firestore**, при превышении — по сути запрет дальнейшего доступа к БД для этого uid.

### 6.1 Почему Security Rules не подходят

- Правила вычисляются **на каждый запрос**, но **не имеют** встроенного «счётчика reads за сутки».
- Read **не может** атомарно увеличить счётчик в другом документе в том же запросе (модель Firestore: правило либо allow/deny).
- Обход через «читай документ quota перед каждым read» удваивает reads и всё равно не синхронизирует идеально без сервера.

### 6.2 Реалистичные архитектуры

1. **Операционные:** бюджеты GCP, алерты, ручной/скриптовый бан uid через Admin SDK при аномалии (вне этого репозитория).
2. **Firebase App Check:** снижает долю автоматизированного/реплейного трафика с невалидным токеном приложения; **не** заменяет лимит reads per uid.
3. **Клиентский счётчик:** улучшает UX честного пользователя; **не** останавливает атакующего с токеном.
4. **Cloud Functions / отдельный backend как прокси:** единственный путь к **жёсткому** учёту; противоречит текущей прямой модели клиент↔Firestore и дорог в разработке.

---

## 7. Данные: что хранится и оптимизация

### 7.1 Локально (IndexedDB)

- Плоские узлы с `parentId`, дерево в памяти ([`src/db.ts`](../src/db.ts), см. AGENTS).
- При сохранении дочернего узла **обновляется `updatedAt` родителя** — намеренно для синка; это **увеличивает** «шум» конфликтов/диффов, но нужно для облака.

### 7.2 В Firestore

- **Узлы** `users/{uid}/nodes/{nodeId}` — основной объём reads при полном скане.
- **Журнал** в `users/{uid}/security/` — отдельные документы на события, TTL `expiresAt` + cleanup ([`writeChangeLog`](../src/firebase/sync.ts)).
- **sync_meta** — метка последнего изменения для экономии полных fetch.

**Потенциально «лишнее»:**

- Журнал хранит **payload** изменений; при активной работе много мелких документов → **storage + reads** подписчика.
- **Tombstones** (soft delete) увеличивают число документов до purge в bulk sync (логика purge в `syncAllNodesToFirestore` — см. код).

**Шифрование:** чувствительные поля уходят в облако в зашифрованном виде при наличии ключа (ветка `security` / `securityManager` — не ослаблять, см. AGENTS).

---

## 8. Синхронизация между вкладками (без облака)

В [`SyncManager.tsx`](../src/components/SyncManager.tsx): `BroadcastChannel('sync_updates')` + событие `syncManager:dataUpdated`.  
Вторая вкладка **перечитывает IndexedDB** (`NodePage` → `loadNode`), **без** обязательного похода в Firestore для зеркалирования локальных правок.

---

## 9. Логирование и утечки PII

По grep по `src/**/*.ts(x)`: активны в основном `console.error` / `console.warn` с текстом ошибок и **id узлов**; явного логирования расшифрованных `title` в прод-путях не выявлено в выборке.  
Риск: любой расширенный лог при отладке может вывести payload — **политика:** не логировать расшифрованные поля (уже в AGENTS).

---

## 10. CI/CD

- [`ci.yml`](../.github/workflows/ci.yml): `npm ci` + `npm run verify` — секретов нет.
- [`deploy.yml`](../.github/workflows/deploy.yml): Firebase `VITE_*` только из **GitHub Secrets**; проверка что `dist/index.html` — production bundle.  
- **Риск:** если секреты утекут в fork PR — стандартная защита GitHub (secrets не доступны из внешних fork без явных дыр); держать ветку `main` защищённой.

---

## 11. Хостинг и заголовки безопасности

- **Vite** ([`vite.config.ts`](../vite.config.ts)): PWA, `base` для GitHub Pages; **нет** настройки CSP/security headers (для статики GitHub Pages заголовки часто задают через **Cloudflare** или аналог).
- **Service Worker** (PWA): кэширование ассетов — при деплое важна корректная инвалидация (workbox в конфиге плагина).

---

## 12. Чеклист до «открытого наплыва» (приоритеты)

### P0 — обязательно до вирусного трафика

1. GCP **Billing budgets + email alerts**.  
2. **Firebase App Check** (Web): задайте `VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` в `.env` / GitHub Secrets ([`src/firebase/config.ts`](../src/firebase/config.ts)); поэтапное enforcement в Rules — см. комментарий в [`firestore.rules`](../firestore.rules).  
3. Убедиться, что опубликованные **`firestore.rules`** совпадают с репозиторием.  
4. Runbook: что делать при `resource-exhausted`, `permission-denied`, всплеске cost за час.

### P1 — злоупотребления

1. Клиентский **мягкий** дневной бюджет тяжёлых операций (полный `getDocs`) + телеметрия (Sentry и т.д.).  
2. Процесс **бана uid** (скрипт с Admin SDK вне репо или Cloud Function только для админов).

### P2 — углубление

1. Пересмотр хранения **Google access token** (сейчас **sessionStorage** + миграция с `localStorage`; полное устранение риска XSS в SPA без backend невозможно).  
2. **CDN** (Cloudflare) перед Pages: кэш, при платном тарифе — WAF, security headers.

### P3 — масштаб

1. Нагрузочный сценарий на reads (N узлов × вкладки × focus).  
2. Виртуализация UI при очень больших деревьях.

---

## 13. Связанные документы в репозитории

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — синк, reads, change log.  
- [`FIREBASE_SETUP.md`](../FIREBASE_SETUP.md) — деплой правил, обслуживание.  
- [`AGENTS.md`](../AGENTS.md) — инварианты данных и безопасности.  
- Ранее созданный план (Cursor): `cross-tab mirror`, `reconnect_cloud_flush`, `production_readiness_security` — не дублировать здесь кодом, только ссылка смысла.

---

## 14. Заключение

Приложение **архитектурно приспособлено** к offline-first и **уже экономит** Firestore reads там, где это заложено в `SyncManager` и meta-check. **Изоляция пользователей в правилах — хорошая.**  
Главные пробелы до «железобетонного» продакшена под наплыв и злоупотребления: **enforcement App Check в Rules** (после стабилизации клиентов), **нет серверного слоя** для жёстких per-user квот reads, **OAuth token в браузерном хранилище** (смягчено до sessionStorage), **нет централизованных security headers** на стороне статики (см. [CDN_AND_HEADERS.md](CDN_AND_HEADERS.md)).

Жёсткий лимит **5000 Firestore reads/день на uid с отключением доступа в правилах** — **технически недостижим без внешнего учёта/прокси**; реалистичная комбинация: **App Check + бюджеты + (опционально) Cloud Functions / Admin реакция**.

---

*Конец отчёта. Документ сгенерирован для внутреннего использования; при изменении архитектуры обновлять вручную.*
