# Tổ chức, chat và lịch CLB — 15/11/2026

## Phạm vi đã sửa local

- Gộp Ban & thành viên và Tài khoản & bổ nhiệm vào một màn hình Tổ chức & quản trị. Route /admin cũ là alias.
- Admin, super_admin hoặc chức vụ CLB president/vice_president (đã active) được mở màn hình quản trị. Trưởng ban/thành viên không thấy mục này và bị chặn khi nhập route trực tiếp.
- Chức vụ CLB lưu ở profiles.club_position, tách khỏi department_members.role và departments.head_id.
- Chat có scope direct/group/department/club. Danh bạ chat dùng profiles_public; hội thoại ban dựa trên membership, không suy ra quyền từ admin.
- Chat chung CLB là kênh thông báo: mọi active member được đọc, lãnh đạo CLB được gửi. Bộ soạn tin của thành viên ở chế độ chỉ đọc.
- Chat mở cạnh vùng làm việc; có danh sách hội thoại, phóng lớn và thu gọn. Trên màn hình hẹp chat phủ vùng làm việc.
- Một lịch chung với checkbox Lịch cá nhân, Lịch ban của tôi, Lịch chung CLB; giữ Ngày/Tuần/Tháng và bộ lọc công việc.
- Lịch cuộn ngang độc lập với chat; checkbox thật hiện được bằng bàn phím, sửa CSS cũ từng ẩn input.
- Cập nhật tiếp: bỏ input range cuộn lịch; dùng scrollbar tự nhiên mảnh, track trong suốt, hỗ trợ cuộn ngang bằng chuột/trackpad và phím trái/phải khi focus lịch. Bảng màu trung tính sáng/tối nằm trong `src/app/minimal-theme.css`.
- Form tạo lịch mặc định cá nhân cho thành viên; lịch CLB dành lãnh đạo, lịch ban dành trưởng ban hoặc lãnh đạo.

## Migration bắt buộc trước khi dùng đầy đủ

`db/migrations/0008_club_access.up.sql` chưa chạy lên Supabase.

- Thêm club_position, scope và department_id; tạo một chat chung CLB và chat cho từng ban đang hoạt động.
- Giữ dữ liệu hội thoại cũ; chat riêng/nhóm giữ theo danh sách members. Nếu có nhiều channel cũ, chỉ channel đầu làm chat chung; các channel khác không còn được đọc toàn CLB theo type đơn thuần.
- RLS giới hạn chat/lịch ban theo thành viên. Admin không mặc nhiên đọc chat riêng hay ban không tham gia. Lịch cá nhân không được admin đọc chỉ vì có vai trò admin.
- Đồng bộ trưởng ban với membership; gỡ trưởng ban khỏi ban thì bỏ head_id. Không tự xóa tài khoản/thông điệp/tệp.
- Trigger cập nhật thời gian hội thoại, giữ định danh tin nhắn và chặn sửa nội dung của người khác.
- Helper mới ở schema fpc_private; EXECUTE/USAGE được giới hạn. Migration bọc trong transaction.
- Cần đối chiếu schema/policy live trước khi apply, vì mã SQL local chưa chứng minh schema live giống hệt.

## Xác minh

- TypeScript frontend đạt; bộ unit test hiện có cộng test quyền CLB đạt 56/56.
- Build production đạt trước lần rà cuối; cần dùng kết quả kiểm tra cuối của phiên.
- Chrome headless chạy ứng dụng thật với mọi request Supabase được giả lập: member và vice_president đều qua kiểm tra route, scope chat, composer thông báo, checkbox và cuộn ngang. Đây không phải kiểm thử RLS live.
- `db/tests/0008_club_access.sql` tạo fixture trong transaction rồi ROLLBACK, kiểm tra member/head/leader/outsider. Chưa chạy vì chưa có công cụ SQL.
- `workspace/sandbox/verify-club-ui.mjs` là smoke test browser với dữ liệu giả, không dùng tài khoản thật.

## Kết nối Supabase

Plugin Supabase đã được Plugin Management xác nhận installed + ENABLED. Kỹ năng plugin đã đọc.
Endpoint MCP phản hồi HTTP 401 khi không gửi token (server có phản hồi). Tuy nhiên danh mục công cụ của phiên chưa có execute_sql/list_projects/apply_migration/search_docs của Supabase.
Chưa chạy SQL, chưa tạo khóa mới và chưa truy cập credential OAuth của plugin. Cần phiên cung cấp công cụ Supabase sau khi hoàn tất kết nối/tải lại chat để apply và chạy test RLS.

Tham chiếu: https://supabase.com/docs/guides/database/postgres/row-level-security và https://supabase.com/docs/guides/getting-started/mcp.
# Guard đọc collaboration — 16/11/2026

## Task assignment, review và audit — mốc mới sau guard đọc

- Live migrations: `20261116082005_task_assignment_audit_guard`, `20261116082333_work_review_audit_boundary`; bản SQL cùng tên trong db/migrations, không phụ thuộc việc triển khai 0008.
- Chỉ active club manager hoặc trưởng ban đúng department tạo task/subtask; giữ luồng lịch tạo task ban. Tệp SQL dùng `public.is_club_admin()` nên tương thích club_position khi 0008 triển khai. Creator/session, parent, trạng thái ban đầu được kiểm tra; UPDATE không dùng làm đường vòng để đổi cha/ban trái quyền.
- DB sinh lịch sử qua trigger trên 4 bảng, actor từ session, timestamp server, trạng thái OLD/NEW. Client không còn quyền INSERT/UPDATE/DELETE task_history; đã bỏ 8 logHistory calls và helper TS, thêm nhãn timeline cho sự kiện DB trung tính. Một cập nhật no-op không thêm audit. Dòng lịch sử cũ giữ nguyên, chưa được xác minh lại; không coi lịch sử trước mốc là chứng cứ đã kiểm chứng.
- Chặn đường vòng audit qua INSERT bài nộp giả điểm/trạng thái approved: bài nộp chỉ từ assignee active; nghiệm thu chỉ từ head/manager đúng task, pending và không có reviewer lúc tạo. UPDATE review khóa content/ownership; reviewer và thời gian do DB xác định. Head được chấm bài thuộc task mình quản lý, lãnh đạo active được duyệt nghiệm thu. Metadata file authorization chưa sửa.
- Đã thay touch trigger RIÊNG tasks/subtasks bằng hàm timestamp tương thích có/không version, vì live thiếu version gây lỗi UPDATE. Thêm `subtasks.submitted_at` và `tasks.reject_count` đang được frontend dùng nhưng live thiếu; không sửa touch_row chung cho module khác.
- Checkpoint TS trước sửa: `E:/f-code-studio/workspace/evidence/task-audit-before-20261116/` gồm task-service, task-workflow, task-history-modal. Không reset toàn repo hoặc sửa lại migration đã áp dụng. Nếu frontend lỗi có thể phục hồi chọn lọc checkpoint rồi kiểm tra tương thích; DB triggers vẫn là nguồn audit. Rollback DB phải là migration riêng sau khi có biện pháp chặn thay thế: gỡ guard/audit sẽ mở lại finding. Không tự cấp lại INSERT history.
- DB test `db/tests/task_assignment_audit_guard.sql`: 35/35 assertion đạt; test guard đọc trước đó 40/40 vẫn đạt. Fixtures transaction ROLLBACK, sau test không còn profile/task thử. TypeScript và 129/129 unit test đạt. Không tạo Auth user qua API, không gửi email, không dùng credential từng lộ. Chat/event policy fingerprint giữ `36bf527a7b8bd7f96e9512f2c5096839`. Frontend sửa local, chưa deploy Vercel.

## Guard đọc trước đó

Đã áp dụng Supabase migration `20261116074915_collaboration_active_read_guard` qua plugin; bản SQL cùng tên nằm trong db/migrations. Tám bảng: projects, project_phases, tasks, subtasks, submissions, task_submissions, task_history, files.

Guard AS RESTRICTIVE FOR SELECT TO authenticated đọc trạng thái active từ profiles theo auth.uid(); không tạo helper SECURITY DEFINER, không phụ thuộc SQL 0008. Các policy cũ của active user tiếp tục quyết định phạm vi; đây không phải thay đổi quyền giữa các ban. Parent authorization của API tệp vẫn giữ nguyên.

Test live `db/tests/collaboration_active_read_guard.sql` có fixture cho đủ tám bảng và 5 trường hợp: active đọc được, pending/rejected/không profile đọc 0, thu hồi duyệt cùng danh tính đọc 0. 40 assertion đạt; toàn bộ fixture ROLLBACK, không còn profile/file test. Policy fingerprint chat/events trước/sau đều `36bf527a7b8bd7f96e9512f2c5096839`; không đánh dấu SQL 0008 hay chat/event live là đã kiểm thử hoàn chỉnh.

Trước sửa, một authenticated identity không có profile vẫn đọc thấy 2 projects và 2 tasks. Sau sửa, regression trên RLS DB thật không tái hiện lỗi. Chưa test bằng trình duyệt/PostgREST với token người dùng thật; không dùng service-role key bị lộ. Finding key lộ/rotation là việc riêng. Không thay đổi trạng thái scan/workbench cũ.

Khôi phục: theo PROJECT_MAP; không tự bỏ guard vì việc đó mở lại đường đọc của người chưa duyệt. Phần nội dung phía dưới là trạng thái triển khai tính năng CLB trước guard này.

