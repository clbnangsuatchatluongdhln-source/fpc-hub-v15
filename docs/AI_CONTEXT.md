# FPC HUB v15 — AI Context

> File nay la "hien phap" cua du an. Moi AI agent va nguoi sua code PHAI doc truoc khi lam.

> Điểm vào hiện tại: đọc [PROJECT_MAP.md](../PROJECT_MAP.md) để biết module, quyền, các nhánh lưu trữ, phần chưa deploy và nơi cần sửa. Cập nhật map khi thay đổi kiến trúc hoặc kết nối.

## Chien luoc
PORT tu v14, KHONG rewrite. v14 co ~70% logic da test.

## Stack (CHOT - khong doi)
- Frontend: Vite + **Vanilla TypeScript** (khong React/Vue/framework)
- DB: Supabase Postgres (schema hien co + migration additive)
- Deploy: Netlify production; giữ adapter Vercel tương thích. Xem docs/NETLIFY_DEPLOY.md.
- Dependency goc: @supabase/supabase-js, typescript, vite
- Dev tool: **Biome** (lint + format, 1 package, Rust)

## Kien truc: C-CHUAN (Minimal Modular Architecture)

### Cau truc thu muc
    src/
      core/      router.ts, registry.ts, services.ts, events.ts, types.ts
      shared/    components/, utils/
      features/  calendar, projects, tasks, chat, files, departments, admin

### Interface duy nhat
    export type CleanupFn = () => void;

    export interface AppServices {
      supabase: SupabaseClient;
      getUser: () => Profile | null;
      notify: (msg: string, type?: 'info' | 'error' | 'success') => void;
      navigate: (path: string) => void;
    }

    export interface Feature {
      id: string;
      route: string;
      mount: (
        container: HTMLElement,
        services: AppServices
      ) => void | CleanupFn | Promise<void | CleanupFn>;
    }

- Khong init() rieng - gop vao mount().
- Khong AppContext lon - chi AppServices nho.
- Khong DI, khong plugin dong.
- Router dung **Hash** (#/tasks) de tranh rui ro rewrite History API.
- Events: CustomEvent cua browser + wrapper typed, chi tao khi thuc su can.

## Rules (bat buoc)
- TS strict, khong any
- escHtml() truoc moi innerHTML
- Commit: type(scope): msg
- Verify: npx tsc --noEmit sau MOI buoc - 0 loi moi bao xong
- Lint/Format: biome check src (khong ESLint/Prettier)

## 6 Nguyen tac Thep (BAT KHA XAM PHAM)

1. **Khong doi stack, khong rewrite.** Khong chuyen sang React/Vue/Tailwind neu khong co lenh bang van ban cua chu du an.
2. **Cam tu y them dependency.** Muon them phai giai thich ly do va cho duyet. Cai dung package, khong tu bia version.
3. **Schema la chan ly.** Truoc khi viet/sua bat ky service.ts nao, BAT BUOC doc db/migrations/*.sql va src/core/types.ts. Tuyet doi khong doan ten bang/cot theo tri nho.
4. **Co lap module.** Feature import tu core/ va shared/. CAM import truc tiep feature khac. Logic dung chung -> shared/ hoac core/. Khong tao vong phu thuoc.
5. **Cam xoa node_modules.** Gap EBUSY/EPERM thi DUNG ngay sau lan dau, bao chu du an xu ly file lock. Khong chay lap lenh install.
6. **Lam tung module + verify.** Khong viet tran lan nhieu tinh nang cung luc. Sau moi buoc sua doi, BAT BUOC chay npx tsc --noEmit. Chi khi exit code 0 moi bao hoan thanh.

## Never
- USING (true) trong RLS
- Public bucket
- getPublicUrl - dung signed URL
- Fix bug ngoai current tunnel
- Tu them abstraction khi chua co van de thuc te

## Nguyen tac toi thuong
> FPC HUB khong xay de chung minh biet nhieu cong nghe. No phai de **mot nguoi khong chuyen sau van hieu cau truc**, nho AI sua dung module, phat trien nhieu nam khong phai viet lai.
