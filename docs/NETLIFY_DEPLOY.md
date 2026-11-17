# Đưa FPC HUB lên GitHub + Netlify

> **Trạng thái mới nhất — 17/11/2026:** Netlify đã deploy ready: https://fpc-hub-v15.netlify.app, commit app e0a5245, deploy 6afc296e4f54d342bbf7c7aa. Gateway và storage-maintenance Node 22 có thật; cron 02:05 UTC = 09:05 Asia/Bangkok. HTTP smoke đang bị Netlify team login toàn site chặn, chưa xác minh API cloud. Chờ chủ dự án duyệt chuyển SSO sang chỉ non-production; chưa thay đổi access-control. 171 unit pass; fixture cloud thất bại ở gate đã dọn, 0 test user và 0 retention job thật.


- Vite build xuất dist; netlify.toml chuyển /api/* sang gateway Function.
- netlify/_lib/bridge.ts giữ nguyên method, Bearer, JSON, status và CORS của 5 API hiện có; body tối đa 32 KiB. Không chuyển file bytes qua Function.
- netlify/functions/storage-maintenance.ts là Scheduled Function 02:05 UTC (09:05 Asia/Bangkok), chỉ áp dụng lịch cho published production deploy. Netlify không cho gọi scheduled function qua URL; thời gian chạy giới hạn, worker dùng AbortSignal 20 giây và giữ trạng thái để retry.
- Supabase pg_cron vẫn nhắc 09:00 hằng ngày. Vercel adapter/config giữ tương thích nhưng không cần Vercel để chạy Netlify.
- Biến frontend VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY là public, scope Builds. Secret SUPABASE_SERVICE_ROLE_KEY, B2_*, TIGRIS_STORAGE_*, IMAGEKIT_*, STORAGE_CONN_* chỉ phía server, scope Functions, không VITE_. APP_ORIGINS chứa origin chính xác của site và local khi cần test. Không đặt secret trong netlify.toml.
- Khi có domain production: thêm origin vào B2/Tigris CORS, giữ bucket private; thêm redirect URL Supabase Auth nếu sử dụng email/OAuth redirect. Không cho phép wildcard preview domain đọc dữ liệu CLB.
- Lần sau thêm kho: script connect-storage lưu bộ key local và registry; phải đồng bộ các biến STORAGE_CONN_<NAME>_* sang Functions trên Netlify rồi deploy lại. Có key local không có nghĩa môi trường cloud đã nhận key.
- Kiểm thử: 171 unit bao gồm bridge/auth/body limit/route whitelist và worker abort; typecheck pass. Build/functions packaging và smoke cloud cần kiểm tra trước khi ghi deploy hoàn tất.

Mốc chuẩn bị trước deploy: xem trạng thái mới nhất đầu tài liệu.


## Kế hoạch environment đã rà soát

Đích duy nhất: site 47088215-6782-412b-8d8e-79d7d5656524, https://fpc-hub-v15.netlify.app, team Free ngoc-khanh-23-nguyen.

- Builds/public: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- Functions/secret: SUPABASE_SERVICE_ROLE_KEY, B2_APPLICATION_KEY, TIGRIS_STORAGE_SECRET_ACCESS_KEY, IMAGEKIT_PRIVATE_KEY. Chỉ context production; không vào frontend/GitHub.
- Functions/config: SUPABASE_URL, B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_BUCKET, TIGRIS_STORAGE_ENDPOINT, TIGRIS_STORAGE_REGION, TIGRIS_STORAGE_ACCESS_KEY_ID, TIGRIS_STORAGE_BUCKET, IMAGEKIT_PUBLIC_KEY, IMAGEKIT_URL_ENDPOINT, STORAGE_DOCUMENT_PROVIDER, STORAGE_VIDEO_PROVIDER, APP_ORIGINS.
- Nguồn: môi trường local hiện có. Helper scripts/sync-netlify-env.mjs mặc định PLAN_ONLY, chỉ tên biến/scope; --apply mới chuyển giá trị và khóa đúng site ID/domain. Không chuyển R2 hay kho chưa dùng.
- Bộ duyệt tự động yêu cầu chấp thuận cụ thể trước khi chuyển credential sang Netlify; chưa đồng bộ key. Không đưa giá trị key vào hướng dẫn hoặc log.


## Cập nhật thực tế — Netlify Free

Site đã tạo và nối repo public, production branch codex/netlify-deploy. Netlify API từ chối scope riêng với lỗi Upgrade your Netlify account to set specific scopes. Chủ dự án duyệt bốn key/site đích và giao chọn phương án bảo mật/chi phí. Đã chọn Free: 20 biến trong context production, scope mặc định builds/functions/runtime/post_processing; không bật cờ Secrets Controller trả phí. Chỉ hai biến VITE_SUPABASE_* đi vào frontend. Không hứa secret bị cách ly khỏi build; code build production phải được tin cậy. NPM_FLAGS=--ignore-scripts giảm rủi ro lifecycle scripts.

Key đã đồng bộ; domain HTTPS đã thêm CORS Tigris/B2, giữ rule local và bucket private. Windows CLI đóng gói lỗi EISDIR cả Node 24 và 22, nên dùng remote Linux build từ commit đã push. Hash map chuẩn hóa LF để Windows/Git/Linux nhất quán. Deploy vẫn cần kiểm tra thành công trước khi coi site live.

Lần sau: connect-storage.mjs --config <localfile> → npm exec --yes --package=netlify-cli@27.20.0 -- node scripts/sync-netlify-env.mjs --connection TIGRIS_02 --free-tier (chỉ xem plan), thêm --apply sau khi được ủy quyền chuyển bộ key mới tới site. Cuối cùng deploy lại để Functions nạp environment mới. Không cần sửa mã app.

Map phát hành bỏ cache CLI supabase/.temp và db/seed_demo.sql local chưa phát hành; các migration/test/schema nguồn vẫn được theo dõi. Không đổi hoặc xóa tệp demo local. Kiểm tra hash bằng Git blob trước remote build.

Deploy key SSH chỉ đọc đã được chủ dự án duyệt và cấu hình vào đúng repo/site. Main không bị force-push. Production branch là codex/netlify-deploy; source đã push. Chưa xác nhận webhook tự deploy: tiếp tục dùng netlify deploy --remote --prod cho các lần phát hành.

Điểm chờ: automatic approval review từ chối mở Netlify SSO khỏi production vì cần duyệt access-control cụ thể. Câu hỏi phê duyệt đã gửi; không tự thay đổi khi chưa có câu trả lời.
