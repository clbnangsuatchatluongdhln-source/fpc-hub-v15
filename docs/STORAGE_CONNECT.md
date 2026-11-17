# Thêm tài khoản kho mới

Không cần cùng Gmail. Mỗi tài khoản/bucket có một kết nối và namespace secret riêng. Không thay key tài khoản cũ bằng key tài khoản mới: tệp cũ vẫn cần bộ key gốc.

Tạo tệp local có đuôi **.storage.local.json** (được gitignore); không dán secret vào chat, source hoặc bản đồ. Ví dụ dưới đây dùng placeholder:

```json
{"name":"TIGRIS_02","label":"Tài liệu dự phòng","provider":"tigris","bucket":"ten-bucket-thuc","capacityMiB":4096,"priorities":{"document":20,"video":30},"credentials":{"ACCESS_KEY_ID":"YOUR_KEY","SECRET_ACCESS_KEY":"YOUR_SECRET","ENDPOINT":"https://t3.storage.dev","REGION":"auto"}}
```

Chạy từ dự án: `node scripts/connect-storage.mjs --config C:/private/new.storage.local.json`.

- Tigris/B2: credentials dùng ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION; B2 endpoint/region lấy từ chính bucket. Key giới hạn đúng bucket và prefix fpc-hub/, có quyền đọc/ghi/xóa tệp; bật version của B2. Nếu CORS chưa có, script cần quyền xem/sửa CORS bucket hoặc admin cấu hình trước.
- ImageKit: provider imagekit, bucket imagekit, priorities image:20; credentials PRIVATE_KEY, PUBLIC_KEY, URL_ENDPOINT của chính tài khoản (ví dụ https://ik.imagekit.io/your_id). Script chỉ tạo ảnh private.
- capacityMiB là ngân sách an toàn do admin chọn, không phải tự phát hiện gói miễn phí. Kiểm tra hạn mức, băng thông/request và điều khoản từng nhà cung cấp; hệ thống không đảm bảo không phát sinh phí ở provider.
- Script thử upload/đọc private/xóa tệp UUID, kiểm tra CORS cho S3; chỉ đăng ký kết nối sau khi thử thành công. Không in secret. Key lưu .env.local phía server dưới STORAGE_CONN_<NAME>_*, registry Supabase không có secret.
- Restart dev server để nạp secret. Khi deploy, thêm cùng biến môi trường vào server hosting; không đặt VITE_. Không cần sửa source để thêm tài khoản.
- Kho tài nguyên → quản trị: số ưu tiên nhỏ nhận trước; để trống loại không nhận. 80% cảnh báo, 90% dừng nhận mới và chọn kho tiếp theo. Tệp cũ giữ connection_id và B2 version gốc.
- Tắt nhận tệp mới vẫn cho đọc/xóa tệp cũ. Không xóa key hoặc tài khoản khi còn dữ liệu; nếu rotate key, chỉ thay bằng key của cùng tài khoản/bucket.

Nếu probe lỗi, script dừng và không đăng ký kho. Nếu provider từ chối dọn tệp thử, kiểm tra thư mục fpc-hub/_connection-tests trên chính kho đó. File cấu hình secret giữ ở máy riêng hoặc xóa sau khi nhập; không gửi lên Git.

Thử toàn luồng: `node scripts/verify-storage-app.mjs --pause-for-approval --pause-for-admin` tạo tài khoản @example.invalid. Runner chỉ in ID fixture để duyệt active, rồi admin bằng SQL quản trị trong test; không dùng tài khoản thật. Sau test runner dọn user, quota, event/job/connection fixture. Không tự áp quyền admin cho tài khoản sử dụng thực tế.

Cloud Netlify hiện dùng Free: environment context production mặc định bao gồm cả build/server, không chỉ Functions. Sau khi thêm tài khoản NAME, dùng sync-netlify-env.mjs --connection NAME --free-tier để xem plan rồi --apply khi được phép chuyển key. Deploy lại; chỉ lưu local chưa đủ cho cloud.
