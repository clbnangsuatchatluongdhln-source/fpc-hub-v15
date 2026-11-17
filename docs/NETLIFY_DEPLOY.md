# FPC HUB trên GitHub + Netlify — 17/11/2026

> **B2_02 đã lên production:** app commit d23d9cc, deploy 6afc36469a4102ae56fea334. Key con được đồng bộ theo namespace riêng. 17 kiểm tra kết nối mới trên cloud đạt và đã dọn fixture; 14 public asset không có key server. Cấu hình Public production / Private preview giữ nguyên.


> https://fpc-hub-v15.netlify.app đã mở: Production Public, Deploy Preview Private (đã lưu qua dashboard và kiểm tra màn đăng nhập FPC). Gateway 5 API + scheduled storage-maintenance Node 22 đã deploy; cron 02:05 UTC = 09:05 Asia/Bangkok. 68 kiểm tra API thật trên Netlify đạt; 171 unit pass; 14 HTML/JS/CSS public không chứa key server. Tài khoản/tệp test đã dọn. Source app đang chạy e0a5245; nhánh phát hành codex/netlify-deploy chứa map mới.

## Địa chỉ và nhánh

- App: https://fpc-hub-v15.netlify.app
- Repo: https://github.com/clbnangsuatchatluongdhln-source/fpc-hub-v15/tree/codex/netlify-deploy
- Netlify dashboard: https://app.netlify.com/projects/fpc-hub-v15
- Site ID: 47088215-6782-412b-8d8e-79d7d5656524; team Free ngoc-khanh-23-nguyen.
- Deploy đã kiểm tra: 6afc296e4f54d342bbf7c7aa, app commit e0a5245. Main không bị force-push. Netlify có deploy key GitHub chỉ đọc do chủ dự án duyệt.

## Đường chạy

netlify.toml build Vite dist; /api/* rewrite sang gateway. netlify/_lib/bridge.ts giữ Bearer/method/JSON/status/CORS, body tối đa 32 KiB. Năm API upload-url, file-metadata, download-url, file-delete, storage-control dùng cùng service/DB guard local. File bytes đi trực tiếp browser ↔ provider.

storage-maintenance là Scheduled Function 09:05 mỗi ngày. Metadata deploy xác nhận lịch; không gọi trực tiếp qua URL trong production. Worker dùng AbortSignal 20 giây, lỗi giữ trạng thái để retry; sự kiện phải được admin duyệt và chờ 7 ngày. Supabase pg_cron nhắc 09:00 vẫn hoạt động. Chưa chạy dọn sự kiện thật khi test; test chỉ dùng fixture riêng.

## Biến môi trường — giới hạn Free thực tế

Netlify Free từ chối scope riêng Functions. Chủ dự án đã duyệt bốn key/site đích và giao chọn phương án bảo mật/chi phí. Đã chọn environment mặc định chỉ context production, scopes builds/functions/runtime/post_processing, không bật cờ Secrets Controller trả phí. Key hiện diện trên máy chủ build và Functions; không được mô tả là cách ly khỏi build.

Chỉ VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY được đưa vào frontend. Bốn secret: SUPABASE_SERVICE_ROLE_KEY, B2_APPLICATION_KEY, TIGRIS_STORAGE_SECRET_ACCESS_KEY, IMAGEKIT_PRIVATE_KEY. Cấu hình phụ gồm URL/bucket/region/key ID, provider routing và APP_ORIGINS. Không có giá trị key trong source/map/GitHub. NPM_FLAGS=--ignore-scripts giảm thực thi lifecycle scripts lúc npm install; build production phải là mã được tin cậy.

scripts/sync-netlify-env.mjs mặc định PLAN_ONLY, khóa đúng site ID/domain, chỉ in tên/scope. --free-tier chọn scope mặc định; --apply chuyển giá trị khi đã được ủy quyền. Không in token/key. .env*, .netlify và cache Supabase được gitignore.

## Nối tài khoản kho mới

1. scripts/connect-storage.mjs --config <file.storage.local.json>: probe thật, ghi registry + namespace secret local STORAGE_CONN_<NAME>_*.
2. npm exec --yes --package=netlify-cli@27.20.0 -- node scripts/sync-netlify-env.mjs --connection NAME --free-tier: xem plan cho đúng kho.
3. Thêm --apply khi được phép chuyển bộ key mới tới site; rồi deploy lại để Functions nạp env mới. Không cần sửa mã app.
4. scripts/configure-storage-cors.mjs --apply thêm đúng origin production cho các kết nối S3, giữ rule cũ. CORS Tigris/B2 hiện đã có domain này; bucket vẫn private.

## Visibility đã áp dụng

Dashboard → Project configuration → General → Visitor access → Project visibility. Đã chọn Customize → Private → Applies to Previews only → Save. Kết quả hiển thị Production Public, Deploy Preview Private. Thành viên chỉ cần tài khoản FPC khi mở link chính.

Không dùng enum API phỏng đoán: sso_login_context=non-production bị 422 và không đổi cấu hình. Thay đổi visibility đã được chủ dự án duyệt rồi thực hiện qua dashboard. Không đổi default của cả team.

## Phát hành và kiểm tra

- Push lên codex/netlify-deploy rồi chạy netlify deploy --remote --prod. Chưa xác nhận webhook tự deploy; không coi push là đã publish.
- Windows bundler bị EISDIR trên Node 24/22; remote Linux build đã thành công. Không cần sửa dependency app.
- Map hash chuẩn hóa LF; kiểm tra 176 Git blob khớp. Bỏ cache CLI và db/seed_demo.sql local không phát hành, giữ file local nguyên trạng.
- Đã đạt 171 unit; Netlify thật 68 kiểm tra API ba kho + admin/quota/approve/hold/notification; trang/assets HTTP 200, CORS preflight 204 và origin lạ 403. Payload hợp lệ tới API chưa Auth bị 401; payload xóa rỗng có thể 400 do validation trước Auth.
- Đã quan sát màn đăng nhập FPC trên browser. Quét 14 asset HTML/JS/CSS public không thấy secret server; fixture được dọn. Không có xóa sự kiện thật. Đây không phải kết luận đã audit mọi module; SQL0008/chat-notification Edge Function còn theo trạng thái riêng trong map.

## Quay lại khi lỗi

Netlify Deploys cho phép quay về deploy trước; giữ registry và env của kho cũ để đọc tệp. Không rollback/drop database hoặc đổi key/bucket chỉ vì lỗi hosting. Muốn tạm khóa site: Project visibility → Private → Production and previews, theo quyết định của chủ dự án. Map và STORAGE_CHANGELOG.md lưu đường đi.
