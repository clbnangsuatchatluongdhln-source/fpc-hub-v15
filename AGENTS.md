# Hướng dẫn vào dự án FPC HUB v15

Mở bản hình [docs/PROJECT_MAP.html](docs/PROJECT_MAP.html) để định vị nhanh. Sau MỖI thay đổi mã/config/schema: cập nhật mô tả liên quan trong PROJECT_MAP.md và `scripts/update-project-map.mjs`, ghi kiểm tra và cách quay lại trong docs/STORAGE_CHANGELOG.md khi đổi lưu trữ; chạy `npm run map:update`, `npm run map:check`. Build sẽ từ chối map có dấu vân tay cũ. Không chỉ chạy lệnh cập nhật hash mà bỏ qua rà soát mô tả. Trước thay đổi lớn, lưu checkpoint chọn lọc; không reset toàn bộ repo có thay đổi dở.

Đầu mỗi phiên, đọc [PROJECT_MAP.md](PROJECT_MAP.md), sau đó [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md). Map là điểm vào kiến trúc, trạng thái và bảng định vị tệp; không cần quét toàn bộ repo.

- Mục tiêu của chủ dự án: khoảng 60 tài khoản, khoảng 15 người dùng thường xuyên, không máy chủ riêng/không phí duy trì cố định; nhiều kho miễn phí được nối qua một đầu mối.
- Phân biệt mã local, bản đã kiểm thử và bản đã deploy. Không coi migration/Edge Function trong repo là đã áp dụng lên Supabase.
- Chọn phạm vi sửa theo bảng mục 6 trong map. Giữ stack và các quy tắc của AI_CONTEXT; kiểm tra Git trước sửa để giữ công việc đang dở.
- Khi đổi đường kết nối, schema, quyền, nơi lưu tệp hoặc trạng thái triển khai, cập nhật PROJECT_MAP.md cùng thay đổi. Chỉ ghi điều đã đối chiếu; không lưu khóa bí mật.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**This project has a knowledge graph. Start with the code-review-graph
MCP tools to narrow scope, then read the source.** The graph is cheaper than scanning files and
gives you structural context (callers, dependents, test coverage) that file search cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool(include_source=True, expand_neighbors=True)`
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

### Verify in the source

- Answer from `include_source=True, expand_neighbors=True`; read a file only if truncated.
- Do not change code from graph output alone: for any non-trivial change,
  read the implementation and the relevant tests before concluding.
- Verify the exact source when touching behavior, database logic, migrations, retries, fallbacks,
  recovery, or compatibility code.
- When the graph and the source disagree, the source wins. The graph may be stale.
- An empty graph result can mean "not indexed" or "not statically visible", not "does not exist".

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
<!-- /code-review-graph MCP tools -->
