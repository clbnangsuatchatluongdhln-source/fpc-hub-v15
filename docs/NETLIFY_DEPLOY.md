# Đưa FPC HUB lên GitHub + Netlify

- Vite build xuất dist; netlify.toml chuyển /api/* sang gateway Function.
- netlify/_lib/bridge.ts giữ nguyên method, Bearer, JSON, status và CORS của 5 API hiện có; body tối đa 32 KiB. Không chuyển file bytes qua Function.
- netlify/functions/storage-maintenance.ts là Scheduled Function 02:05 UTC (09:05 Asia/Bangkok), chỉ áp dụng lịch cho published production deploy. Netlify không cho gọi scheduled function qua URL; thời gian chạy giới hạn, worker dùng AbortSignal 20 giây và giữ trạng thái để retry.
- Supabase pg_cron vẫn nhắc 09:00 hằng ngày. Vercel adapter/config giữ tương thích nhưng không cần Vercel để chạy Netlify.
- Biến frontend VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY là public, scope Builds. Secret SUPABASE_SERVICE_ROLE_KEY, B2_*, TIGRIS_STORAGE_*, IMAGEKIT_*, STORAGE_CONN_* chỉ phía server, scope Functions, không VITE_. APP_ORIGINS chứa origin chính xác của site và local khi cần test. Không đặt secret trong netlify.toml.
- Khi có domain production: thêm origin vào B2/Tigris CORS, giữ bucket private; thêm redirect URL Supabase Auth nếu sử dụng email/OAuth redirect. Không cho phép wildcard preview domain đọc dữ liệu CLB.
- Lần sau thêm kho: script connect-storage lưu bộ key local và registry; phải đồng bộ các biến STORAGE_CONN_<NAME>_* sang Functions trên Netlify rồi deploy lại. Có key local không có nghĩa môi trường cloud đã nhận key.
- Kiểm thử: 171 unit bao gồm bridge/auth/body limit/route whitelist và worker abort; typecheck pass. Build/functions packaging và smoke cloud cần kiểm tra trước khi ghi deploy hoàn tất.

Trạng thái hiện tại: đang chuẩn bị release, site đã tạo, URL chưa có app được xác minh. Không coi repo GitHub hay build local là site đã chạy production.


## Kế hoạch environment đã rà soát

Đích duy nhất: site 47088215-6782-412b-8d8e-79d7d5656524, https://fpc-hub-v15.netlify.app, team Free ngoc-khanh-23-nguyen.

- Builds/public: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- Functions/secret: SUPABASE_SERVICE_ROLE_KEY, B2_APPLICATION_KEY, TIGRIS_STORAGE_SECRET_ACCESS_KEY, IMAGEKIT_PRIVATE_KEY. Chỉ context production; không vào frontend/GitHub.
- Functions/config: SUPABASE_URL, B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_BUCKET, TIGRIS_STORAGE_ENDPOINT, TIGRIS_STORAGE_REGION, TIGRIS_STORAGE_ACCESS_KEY_ID, TIGRIS_STORAGE_BUCKET, IMAGEKIT_PUBLIC_KEY, IMAGEKIT_URL_ENDPOINT, STORAGE_DOCUMENT_PROVIDER, STORAGE_VIDEO_PROVIDER, APP_ORIGINS.
- Nguồn: môi trường local hiện có. Helper scripts/sync-netlify-env.mjs mặc định PLAN_ONLY, chỉ tên biến/scope; --apply mới chuyển giá trị và khóa đúng site ID/domain. Không chuyển R2 hay kho chưa dùng.
- Bộ duyệt tự động yêu cầu chấp thuận cụ thể trước khi chuyển credential sang Netlify; chưa đồng bộ key. Không đưa giá trị key vào hướng dẫn hoặc log.
