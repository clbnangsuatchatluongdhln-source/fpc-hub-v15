# Chat Phase 2 — 2026-11-15

## Thay đổi trong phiên

- Thêm Edge Function `chat-notifications`, chỉ nhận webhook có `x-webhook-secret` đúng với `CHAT_WEBHOOK_SECRET`.
- Đọc lại message từ DB, bỏ qua người gửi, system message, tài khoản chưa active; áp dụng mute và archived/mention.
- Notification ID ổn định theo message/user, webhook gửi lại không tạo trùng hay đánh dấu chưa đọc lại.
- Trung tâm thông báo trong header: 50 mục gần nhất, tổng số chưa đọc, mở chat, đánh dấu đọc, realtime và cleanup.
- Đang xem đúng cuộc trò chuyện thì đánh dấu notification mới đã đọc ở client; server vẫn lưu bản ghi để không mất lịch sử đa thiết bị.
- IndexedDB outbox riêng từng user, lưu trước khi gửi, phục hồi sau reload, tự thử lại mỗi 15 giây hoặc khi online. Giữ client_id khi thử lại, kiểm tra xung đột trước khi coi đã gửi.
- Đồng bộ keyset theo created_at + id, 200 tin/trang; có cửa sổ chồng lặp 60 giây. Đồng bộ khi online/focus/hiện tab và mỗi phút khi tab hiển thị.
- Cursor giữ theo phiên local; lần mở mới tải lịch sử đầy đủ có phân trang. Chưa persist cache lịch sử/cursor và chưa triển khai tải lịch sử cũ theo thao tác cuộn.
- Không thay schema, không thêm dependency, không đổi framework.

## Triển khai thông báo

Máy hiện chưa có Supabase CLI/Deno trong PATH và chưa thấy access token quản trị Supabase. Chưa deploy Edge Function hoặc cấu hình webhook.

1. Chuẩn bị Supabase CLI và đăng nhập tài khoản có quyền project.
2. Đặt secret ngẫu nhiên đủ mạnh bằng secret manager/dashboard: `CHAT_WEBHOOK_SECRET`.
3. Deploy `supabase functions deploy chat-notifications --project-ref <project-ref>` từ root dự án. Config đã đặt verify_jwt=false vì handler tự xác thực webhook.
4. Tạo Database Webhook cho INSERT trên public.messages, URL `/functions/v1/chat-notifications`; header `x-webhook-secret` khớp secret. Không đưa secret vào frontend hoặc commit.
5. Gửi tin bằng hai tài khoản thử nghiệm: kiểm tra người nhận, mute, mention, archived, đọc thông báo và webhook gửi lặp.
6. Kiểm thử hai trình duyệt, offline/reload/online, chuyển tài khoản và gửi lại sau mất phản hồi server.

Tham chiếu: https://supabase.com/docs/guides/database/webhooks và https://supabase.com/docs/guides/functions/function-configuration.

## Giới hạn cần kiểm thử/hoàn thiện

- Chưa đánh giá notification fan-out cho channel đông thành viên; truy vấn profile chịu hạn mức trả về của server.
- Chưa có backoff theo mã lỗi, nút hủy/gửi lại thủ công; tin bị từ chối bởi quyền có thể còn trong outbox và được thử lại.
- Incremental hiện tập trung tin mới; có đối soát trạng thái tin đã gửi/chưa seen theo ID. Sửa/xóa của tin cũ ngoài cửa sổ replay cần cơ chế reconciliation bổ sung.
- Chưa có bảo đảm replay với transaction trễ hơn cửa sổ 60 giây.
- Mã theo dõi trạng thái tin hiện dùng status chung từ schema cũ; receipt theo từng thành viên nằm ngoài thay đổi này.
- Chưa đánh dấu hoàn tất Phase 2 trước khi qua kiểm thử runtime và DB hai user.

## Kết quả xác minh

- TypeScript frontend và kiểu Edge Function kiểm tra bằng tsc; chưa chạy Deno runtime.
- Smoke test Chrome headless với dữ liệu giả: mobile panel không tràn, text không chèn HTML, mark read/mở chat, cleanup; IndexedDB giữ tin sau reload, lọc theo user, gửi lại khi online.
- Read-only Supabase thật: messages, conversation_states, notifications đều tồn tại và các cột cần dùng truy vấn được. Không tạo dữ liệu thử trong hội thoại thật.
- Script browser: `workspace/sandbox/verify-phase2-browser.mjs`, Vite localhost port 5178.
- Script schema: `node scripts/verify-chat-phase2.mjs <đường-dẫn-credential-local>`; không in credential hay nội dung tin.
