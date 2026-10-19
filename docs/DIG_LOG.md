# DIG LOG

| Tunnel | Ngày | Why | Dug | Found | Decision | Commit | Next |
|---|---|---|---|---|---|---|---|
| T1 | 2026-10-19 | Setup Vite | npm create vite, npm install | 30 phút | Vanilla TS, strict | 7c28e75 | T2 |
| T2 | 2026-10-19 | Code style | ESLint v10 flat config + Prettier | ESLint v10 bỏ .eslintrc | Flat config | 7c28e75 | T3 |
| T3 | 2026-10-19 | Test framework | Vitest 5.0.5, 3 test pass | Vitest nhanh hơn Jest | — | [hash] | T4 |
| T4 | 2026-10-19 | Kết nối Supabase | Client + env + test 404 | PGRST205 = connected OK | Dùng project mới auqxbigkttrktwsfrdba | [hash] | → ZOOM 1 |
| T5 | 2026-10-19 | Nền tảng Database | Sửa lỗi Smart Quote, chạy Script tạo 4 bảng, 3 Enums, Triggers & RLS. Vá lỗi RLS `USING (true)`. | Lỗi nháy cong do copy/paste | Chạy SQL theo từng Part. Tuân thủ nghiêm ngặt quy tắc `Never: USING (true)` của dự án. | 5d94ab1 | T6 |
| T6 | 2026-10-19 | Port Auth Flow | Port logic v14 sang TS, tách `ui`, `core`, `types`. Dán HTML Auth mới. | Vite không nhận thẻ `<link>` CSS; ID MainApp bị lệch | Import CSS vào `main.ts`; dùng ID `mainAppContainer` để ẩn/hiện | aa9767c | T7 |
