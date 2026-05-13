# CDN и security headers (вне GitHub Pages)

GitHub Pages **не** позволяет задать произвольные HTTP-заголовки для HTML/JS. Для продакшена под наплывом и усиления безопасности типичный путь:

1. Поставить **Cloudflare** (или аналог) перед `*.github.io` или custom domain.
2. Включить **HTTPS**, **HSTS** (осторожно с поддоменами).
3. Добавить заголовки (через Rules / Transform Rules), например:
   - `Content-Security-Policy` — начинать с report-only, сужать `script-src` под Vite-хэши и `connect-src` под Firebase/Google endpoints.
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy` — отключить ненужные API браузера

CSP для SPA с Firebase и reCAPTCHA (App Check) потребует явного перечисления доменов Google; тестируйте в staging до enforcement.
