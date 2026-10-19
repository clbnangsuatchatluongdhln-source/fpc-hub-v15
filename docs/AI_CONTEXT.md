# FPC HUB v15 — AI Context

## Chiến lược
PORT từ v14, KHÔNG rewrite. v14 có ~70% logic đã test.

## Stack
- Frontend: Vite + TypeScript
- DB: Supabase Postgres (schema MỚI)
- Deploy: Vercel

## Rules
- TS strict, không `any`
- `escHtml()` trước mọi `innerHTML`
- Commit: `type(scope): msg`
- ESLint v10 flat config (`eslint.config.js`, không `.eslintrc`)

## Never
- `USING (true)` trong RLS
- Public bucket
- `getPublicUrl` — dùng signed URL
- Fix bug ngoài current tunnel
