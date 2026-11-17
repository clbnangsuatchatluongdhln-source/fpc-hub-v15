# Sổ thay đổi kho tệp

## Nối tài khoản B2 thứ hai — 17/11/2026

- FPCBackblaze2 đã thêm thành connection B2_02 (5353ffe3-b4f5-4bde-bf8d-ca780cd6ff71), bucket private FPCblackblaze2, endpoint s3.us-west-004.backblazeb2.com. Dùng key con FPC-HUB-B2-02 chỉ list/read/write/delete files, giới hạn bucket/prefix fpc-hub/. Key quản trị gửi trong chat chỉ giữ local, không đưa Netlify. Ngân sách nội bộ 8 GiB, cảnh báo 80%, dừng 90%; video: B2 cũ 10 → B2_02 15 → Tigris 20; tài liệu: Tigris 10 → B2 cũ 20 → B2_02 30. Đã deploy Netlify (d23d9cc, deploy 6afc36469a4102ae56fea334). 17 kiểm tra đúng B2_02 qua API production đạt: upload/private read/delete, pin version chống replay và cấm đọc ngoài prefix. Fixture đã dọn; rollback DB xác minh B2 cũ chạm ngưỡng thì video mới đi B2_02. Quét 14 asset public không có secret server.
- Bucket mới không có CORS trả NoSuchCorsConfiguration (khác cách viết AWS NoSuchCORSConfiguration); helper nhận cả hai tên. configure-storage-cors thử preflight trước để key con không cần read/write bucket settings khi CORS đã có.
- Thêm verify-storage-connection.mjs: fixture Auth riêng, trusted ticket ép đúng connection, cloud finalize/read/delete, pin version chống replay, negative Head ngoài prefix, cleanup đúng object UUID. Không sửa priority hoặc key kho cũ để test.
- Quay lại nếu lỗi: tắt write_enabled chỉ connection B2_02; giữ env/registry nếu còn tệp. Không xóa kho hoặc thu hồi key đang có tệp. Không đổi schema DB.


## Netlify public production — 17/11/2026

- Chủ dự án duyệt mở link chính. Đã lưu Project visibility qua dashboard: Production Public, Deploy Preview Private; không đổi cả team. API enum non-production bị 422, không có thay đổi ở lần thử đó.
- Netlify thật 68 API check đạt: 3 provider, quota, admin, duyệt/hold và notification. 14 public asset không có secret server. Fixture đã dọn; không xóa sự kiện thật.
- Gateway + cron 09:05 Node 22 đã xác nhận trong deploy metadata; site app commit e0a5245, bản map mới nằm trên nhánh codex/netlify-deploy. Không coi đây là audit toàn app.


## Chuẩn bị Netlify — 17/11/2026

- Thêm gateway Netlify giữ 5 API cũ, cron 09:05 và AbortSignal 20 giây cho cleanup/worker. Body giới hạn 32 KiB; secret không vào bundle. .env và .netlify bị gitignore.
- 171 unit + typecheck pass trước package/deploy. Chưa có site live được xác minh; xem docs/NETLIFY_DEPLOY.md.
- Nếu cần quay lại: adapter Vercel và local vẫn giữ. Không rollback database hoặc đổi key/bucket chỉ để chuyển hosting. Thay đổi cron mới chỉ có hiệu lực sau deploy Netlify production; không gọi worker trong lúc kiểm thử packaging.


## Kho xoay — 17/11/2026 — đã apply Supabase

- Registry theo tài khoản, secrets namespace riêng server; adapter upload/download/delete/cleanup đọc đúng connection gốc. CLI connect-storage probe thật trước khi thêm; unique provider/endpoint/bucket chống đếm đôi. Thêm docs/STORAGE_CONNECT.md.
- Live bốn migration pool governance, schedule, identity, snapshot accounting; thêm events.version để trigger touch_row hiện có cập nhật event được. Thống kê file + reservation cùng snapshot khi finalize đồng thời.
- Quota user, ledger 24 giờ; 80/90% capacity; notifications dedupe/audience private; sự kiện >90 ngày cần admin duyệt + 7 ngày chờ. Worker lỗi giữ trạng thái để retry. Supabase cron nhắc 09:00 hằng ngày; cron xóa Vercel chưa deploy. Giao diện admin ở Kho tài nguyên.
- Đã kiểm tra: 159 unit, 52 DB rollback, API thật 68 check ba provider + admin; build pass, secret scan 170 tệp không phát hiện key server. Fixture đã dọn. Probe duplicate connection từ chối và .env.local không đổi. Không xóa sự kiện/file thật, không đổi key thật.
- Checkpoint trước thay đổi: E:/f-code-studio/workspace/checkpoints/storage-pool-20261117 (chọn lọc source, không có secret). Nếu lỗi: tắt write_enabled của kết nối lỗi, giữ nguyên registry và env để đọc tệp cũ; so sánh đúng adapter/API với checkpoint. Không rollback schema/drop connection còn tham chiếu. Muốn tạm ngừng nhắc dùng cron.unschedule('fpc-storage-governance'); không xóa dữ liệu/khóa. Fix DB bằng migration tiến, không sửa lịch sử migration đã apply.


## S2 — 16/11/2026 — đang cấu hình Tigris

- Cập nhật sau xác nhận: người dùng tự bấm tạo `fpc-hub-v15-server`; đã quan sát màn thành công và thông số S3/IAM/region. Secret chỉ được đọc vào phiên điều khiển tạm thời, chưa lưu bền vững; không coi là cấu hình môi trường hoàn tất. Thao tác mở Manage key permissions lỗi geometry; chưa xác minh scope, chưa thử API. Giữ màn secret mở cho người dùng lưu an toàn, không ghi giá trị vào map hoặc chat.

- Quan sát dashboard đã đăng nhập; tạo bucket `fpc-hub-v15-khaosat` với Public tắt, snapshot/soft-delete giữ mặc định tắt. Endpoint `https://t3.storage.dev`.
- Không thêm phương thức thanh toán. Chưa tạo khóa API; kiểm duyệt tự động chặn nút Add one vì cần xác nhận tạo credential tại thời điểm thao tác.
- Chưa sửa router lưu trữ, chưa chuyển dữ liệu và chưa xác minh upload/tải/xóa. Bucket mới chưa được app sử dụng; khi lỗi vẫn giữ nguyên đường lưu S1, không cần phục hồi DB. Muốn xóa bucket cloud phải xác nhận riêng.

Mỗi mốc ghi: đã đổi gì → đã kiểm tra gì → nếu lỗi quay lại đâu. Không ghi khóa/API token vào đây.

## S1 — 15–16/11/2026 — hoàn tất mã local, chưa deploy

- Trước sửa: tạo checkpoint 12 tệp tại `E:/f-code-studio/workspace/evidence/storage-gateway-20261115-before/`, có `manifest.json` SHA-256. Không chứa `.env`.
- Đã thêm `src/core/storage/`: hợp đồng provider, client upload/tải/xóa chung và test quy chiếu tệp cũ.
- Đã chuyển kho tài nguyên, tệp sự kiện và dự án qua gateway; giữ provider/bucket cũ. Xóa object thất bại thì giữ metadata. Bỏ ký B2 bằng secret frontend; API tải/xóa tra metadata và quyền. API video ngừng trả public URL.
- Kiểm tra: TypeScript đạt; 73/73 unit test đạt, gồm tương thích tệp cũ, quyền theo hồ sơ cha, định tuyến tải/xóa và lỗi upload. Build đạt. Map khớp 128 tệp; thử thêm tệp tạm làm kiểm tra báo stale/exit 1, gỡ tệp thì kiểm tra đạt. Test dùng mock, chưa chứng minh cấu hình kho và quyền DB live.
- Chưa làm: nộp bài/avatar, registry nhiều tài khoản/quota, upload R2, xác minh object và quyền hồ sơ cha khi tạo metadata, giao dịch dọn object mồ côi. SQL 0008/Edge Function chưa xác nhận live; Vite không tự chạy API Vercel.
- Bản hình `docs/PROJECT_MAP.html` mở offline, bấm ô để xem tệp. `map:update` tạo HTML và dấu vân tay; `map:check` phát hiện mã/config/schema đã đổi. Build gọi kiểm tra này trước biên dịch.
- Khi có lỗi: dừng thao tác xóa/tải lên; đối chiếu file đang lỗi với checkpoint trước khi phục hồi. Không `git reset --hard`, không khôi phục cả repo vì còn nhiều thay đổi từ các phiên trước.

### Quay lại mốc trước S1

1. Xác định lỗi thuộc UI gọi tệp, gateway hay API bằng bản hình. So sánh tệp hiện tại với tệp tương ứng trong checkpoint; manifest ghi SHA-256 bản trước sửa.
2. Checkpoint chứa 12 tệp gốc theo đường dẫn tương đối; `api/upload-url.ts` được bổ sung từ HEAD vì tệp này sạch trước S1. Phục hồi chọn lọc cả caller và API tương ứng để tránh trộn hợp đồng cũ/mới; giữ thay đổi mới hơn của người khác bằng diff.
3. Phần mới của S1: `src/core/storage/`, `api/_lib/storage.ts`, `api/_lib/storage-policy.ts`, script/map HTML/state và sổ này. Chỉ bỏ phần mới khi đã gỡ các import/caller phụ thuộc. Không xóa cả thư mục API hoặc core.
4. S1 không di chuyển object, không áp dụng SQL và không xóa dữ liệu thật, nên không có bước rollback DB trong mốc này. Nếu đã deploy sau mốc, phải khôi phục frontend và API cùng phiên bản.
5. Chạy typecheck, test, rà soát mô tả và `map:update`, `map:check`, build. Ghi lại kết quả trước khi mở thao tác upload/xóa cho người dùng.

## Upload approval candidate — 2026-11-16

Require an active server-read profile in api/upload-url.ts before all three provider branches. Offline handler tests cover non-active/missing/error profiles, authenticated identity binding, active uploads and HTTP methods. No schema or live storage changes. Validate with npm test -- api/upload-url.test.ts, npm run typecheck, npm run map:update, npm run map:check and npm run build. Roll back only this upload approval patch and regenerate the map; preserve unrelated work. Revocation of existing tickets is outside this change.
# 17/11/2026 — B2 credentials local

- Lưu cặp khóa FPCB2 do người dùng cung cấp trong .env.local dưới tên B2_KEY_ID/B2_APPLICATION_KEY; tệp được Git bỏ qua, không dùng tiền tố VITE_.
- Đã kiểm tra giá trị được lưu đúng mà không in khóa. Chưa kiểm tra bucket, endpoint, quyền, upload/download hay triển khai server.
- Cần thay khóa trước sử dụng chính thức vì đã xuất hiện trong chat. Quay lại bằng cách thay/xóa đúng hai biến server này, giữ nguyên biến môi trường khác.

# 17/11/2026 — Tigris CLB, cấu hình local

- Lưu khóa FPC-HUB vào .env.local bằng nhóm biến server TIGRIS_STORAGE_*, IAM endpoint riêng. Không ghi đè B2 hoặc dùng VITE_ cho khóa.
- S3 ListBuckets thành công, thấy fpc-hub. Chuỗi HeadBucket/GetBucketAcl trả 403; chưa xác định bước nào bị từ chối, chưa xác minh quyền object/ACL. Không upload hoặc xóa dữ liệu.
- Chưa cấu hình routing ứng dụng/deploy. Khóa đã qua chat cần thay trước dùng chính thức. Rollback: thay/xóa đúng nhóm TIGRIS_STORAGE_* và TIGRIS_IAM_ENDPOINT, giữ các biến khác.

# 17/11/2026 — ImageKit private key local

- Đã bổ sung IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/fpchub. GET /v1/files?limit=1 trả HTTP 200; không ghi nội dung tệp/khóa vào output. Chưa test upload, liên kết endpoint với tài khoản bằng ảnh thực hoặc deploy. Các ghi chú thiếu endpoint bên dưới là lịch sử.

- Bổ sung IMAGEKIT_PUBLIC_KEY do người dùng cung cấp, xác minh đã lưu đúng; còn thiếu IMAGEKIT_URL_ENDPOINT. Chưa thử kết nối/upload/deploy.

- Lưu private key FPCimagekit vào IMAGEKIT_PRIVATE_KEY trong .env.local được Git bỏ qua. Không thay biến B2/Tigris, không dùng VITE_ cho bí mật.
- Xác minh đã lưu đúng mà không in giá trị. Thiếu IMAGEKIT_PUBLIC_KEY/IMAGEKIT_URL_ENDPOINT; chưa thử kết nối/upload/deploy. Cần thay khóa trước dùng chính thức vì đã qua chat.
- Quay lại bằng cách thay/xóa đúng IMAGEKIT_PRIVATE_KEY, giữ các biến môi trường khác.

# 17/11/2026 — Tigris quyền bucket đã xác minh

- Trước: FPC-HUB active, default permissions enabled, Roles None. Sau: Editor chỉ cho fpc-hub, default permissions disabled; đọc lại bằng CLI xác minh.
- PASS HeadBucket, PutObject tệp thử riêng có UUID, GetObject so khớp nội dung, DeleteObject, HeadObject 404. Bucket có soft delete 7 ngày; bản giữ của tệp thử có thể vẫn tồn tại, không purge hoặc thay chính sách giữ dữ liệu.
- Lưu TIGRIS_STORAGE_BUCKET=fpc-hub. Chưa nối routing app, chưa deploy hoặc xác minh ACL public. Các kết quả 403 bên dưới là lịch sử trước cấp quyền.
- Quay lại bằng CLI access-keys assign <id> --revoke-roles nếu cần dừng quyền object; không bật lại quyền mặc định trừ khi thực sự cần. Thay khóa đã qua chat trước dùng chính thức. Không ghi bí mật vào map/log.

# 17/11/2026 — Nối kho local và ràng buộc metadata

- Ảnh → ImageKit private V2 JWT; tài liệu/video → Tigris; B2 adapter sẵn nhưng authorize 401, chưa đủ endpoint/bucket để bật. Không thay provider/bucket tệp cũ; giữ nhận diện video legacy videos/ trong fpc-files.
- Live: migration 20261117041023 tạo storage_uploads và RPC service-only, parent/active guard, quota, atomic finalize; migration 20261117044206 thêm trigger provenance chặn API cũ dùng service role chèn metadata không qua session.
- Client không chèn/sửa files; hub/lịch/dự án dùng chung phiếu và finalize xác minh object; download/delete dựa metadata có quyền. Vite chạy bốn API local, CORS origin cụ thể; Tigris đã thêm rule localhost, không thay rule cũ.
- Đạt: typecheck; 139 unit test; 23 assertion DB rollback; 28 kiểm tra API thật Tigris/ImageKit và dọn Auth/file fixture; provider test upload/read/private/replay/dọn tệp đạt cho hai kho. B2 NOT_READY đã ghi rõ. Chưa load test 15 user hay test production.
- Có cleanup reservation/object bỏ dở sau expiry, giữ reservation khi provider lỗi; script local chạy được. Cron daily khai báo nhưng chưa deploy, CRON_SECRET chỉ có local. Tigris soft delete 7 ngày có thể còn versions; giới hạn nội bộ không cam kết thay thế quota provider.
- Secret chỉ nằm .env.local (Git ignored, không VITE_); cần thay khóa đã qua chat trước production. Không ghi bí mật vào tài liệu. Xem docs/STORAGE_READY_STATUS.md cho các biến cần deploy và cách test.
- Quay lại: dừng upload mới hoặc migration bù phạm vi hẹp, giữ guard và dữ liệu; không mở lại direct INSERT/UPDATE files, không reset DB. Frontend/API cũ có thể bị từ chối upload có chủ ý sau provenance guard.

# 17/11/2026 — Đối chiếu B2 trên dashboard

- Xác nhận FPCBackbalaze private, bật mã hóa, endpoint eu-central-003; lưu B2_ENDPOINT/B2_REGION/B2_BUCKET vào .env.local. Giữ nguyên khóa và routing Tigris/ImageKit.
- FPCB2 còn hiển thị và chưa hết hạn, ID khớp local, namePrefix=FPCB2; quyền có cả quản trị bucket/key, không phù hợp khóa app. Secret local vẫn authorize 401. Chưa tạo/xóa khóa mới.
- Quay lại: sửa/xóa đúng ba biến cấu hình không bí mật vừa lưu; không đổi routing hoặc mở bucket public để chữa lỗi xác thực.

# 17/11/2026 — B2 đã nối và pin version

- Người dùng xác nhận tạo FPC-HUB-storage; tạo trên Chrome, giới hạn bucket FPCBackbalaze/prefix fpc-hub/, preset Read and Write. Secret chuyển thẳng UI → .env.local (Git ignored), không in chat; khóa cũ không xóa.
- B2 authorize thành công. Header PUT If-None-Match gặp 501; thay bằng pin storage_version từ HeadObject ở server, download/delete đúng VersionId. Không bỏ bảo vệ nội dung đã chấp nhận. Hai migration version bound/validation đã apply live; regex Postgres dùng upper bound 200.
- Cleanup B2 sau expiry dọn phiên bản replay, giữ version metadata đang tham chiếu. Bật STORAGE_VIDEO_PROVIDER=b2, ảnh ImageKit/tài liệu Tigris giữ nguyên. CORS localhost đã thêm và preflight 200, bucket vẫn private.
- Sửa reload env Vite, restart đúng server của dự án; test bắt buộc provider thực tế tránh false PASS do provider cũ. Đạt 141 unit test, 27 DB assertion rollback, 43 API check thật với ba provider; provider probe cả ba đạt và dọn các phiên bản thử.
- Quay lại: chuyển STORAGE_VIDEO_PROVIDER=tigris nếu B2 lỗi, restart dev/API; giữ storage_version và đường đọc/xóa B2 cho file đã có. Không xóa cột/mở lại metadata insert hoặc sửa provider của row để giả di chuyển tệp.


- Netlify: site/nhánh đã nối, environment production mặc định (Free không hỗ trợ scope Functions riêng) đã đồng bộ theo ủy quyền. Thêm CORS đúng domain cho Tigris/B2. Map hash chuẩn hóa LF; không đổi key/bucket/quyền dữ liệu. Windows bundler lỗi EISDIR, chuyển remote Linux build.

- Netlify production deploy ready e0a5245; gateway + lịch 09:05 đã có trong deploy metadata. HTTP bị Netlify SSO all chặn; chưa đổi cấu hình vì automatic approval yêu cầu xác nhận riêng, đang chờ người dùng. Cloud test fixture đã dọn. Không báo API cloud đã PASS.

- Chốt B2_02: 171 unit đã đạt ở mốc code; 17 kiểm tra live đúng kho mới và cleanup PASS. DB rotation thử trong rollback, không thay số dung lượng/provider của người dùng thật. 0 test user, 0 file thử còn lại trên backup.
