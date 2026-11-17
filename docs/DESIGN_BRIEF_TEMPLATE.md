# DESIGN BRIEF — Template phân tích ảnh web mẫu

> **Cách dùng:** Sếp gửi ảnh web mẫu cho Gemini kèm prompt:
> *"Phân tích ảnh web này và điền vào template DESIGN_BRIEF bên dưới. Chỉ lấy cảm hứng bố cục và style, KHÔNG copy y nguyên nội dung. Xuất ra markdown."*
> Sau đó copy kết quả gửi lại cho DeepSeek.

---

## 1. TỔNG QUAN
- **Tên web mẫu:** (vd: Linear.app dashboard)
- **Loại app:** (SaaS / dashboard / landing / e-commerce / ...)
- **Cảm giác tổng thể:** (tối giản / sang trọng / vui tươi / chuyên nghiệp / ...)

## 2. LAYOUT
- **Sidebar:** (có/không, bên trái/phải, rộng bao nhiêu px, cố định hay thu gọn được)
- **Header:** (cao bao nhiêu, có sticky không, chứa gì: logo / search / avatar / action buttons)
- **Main content:** (grid mấy cột, tỷ lệ, max-width)
- **Footer:** (có/không, chứa gì)
- **Responsive:** (mobile có thay đổi gì đặc biệt không)

## 3. COLOR PALETTE
| Vai trò | Mã HEX | Ghi chú |
|---|---|---|
| Background chính | #...... | |
| Background card/panel | #...... | |
| Accent (nút, link) | #...... | |
| Text chính | #...... | |
| Text muted | #...... | |
| Border/divider | #...... | |
| Success / Warning / Error | #...... | |

**Gradient:** (có dùng gradient không? Mô tả)

## 4. TYPOGRAPHY
- **Font family:** (Inter / Roboto / system-ui / ...)
- **Heading 1:** (size / weight)
- **Heading 2:** (size / weight)
- **Body:** (size / weight / line-height)
- **Small/Muted:** (size / color)
- **Nút bấm:** (size / weight / uppercase?)

## 5. COMPONENT STYLE
- **Card:** bo góc bao nhiêu px? có shadow không? viền? nền?
- **Button primary:** bo góc, padding, màu, hover state
- **Button secondary/ghost:** style?
- **Input / Select:** bo góc, nền, viền, focus state
- **Badge / Tag:** bo góc, màu nền, size text
- **Avatar:** hình tròn hay vuông bo góc? size?
- **Icon:** line icon hay filled? size mặc định?
- **Modal/Dialog:** nền, bo góc, backdrop
- **Sidebar item:** padding, hover state, active state

## 6. SPACING & SIZING
- **Scale spacing:** (4px / 8px / 12px / 16px / 24px / 32px...)
- **Padding card:** (vd: 16px hoặc 20px)
- **Gap giữa các item:** (vd: 8px)
- **Border-radius chung:** (nhỏ / vừa / lớn — vd: 6px / 8px / 12px)

## 7. ĐIỂM ĐẶC BIỆT (điều làm web này đẹp)
- (vd: glassmorphism nhẹ, viền phát sáng, icon gradient, animation mượt, typography đậm...)

## 8. NHỮNG GÌ NÊN ÁP DỤNG CHO FPC HUB
- (Gemini đề xuất 3-5 điểm cụ thể có thể áp dụng vào app quản trị CLB)

## 9. NHỮNG GÌ KHÔNG NÊN COPY
- (vd: quá nhiều animation gây rối, màu quá chói, layout phức tạp không phù hợp mobile...)

---

## ⚠️ LƯU Ý BẢN QUYỀN
- **Chỉ lấy cảm hứng:** layout, color palette, spacing, typography pattern
- **KHÔNG copy y nguyên:** logo, icon riêng, illustration, text content, hình ảnh
- **KHÔNG copy CSS y nguyên** — chỉ ghi lại *pattern* (vd: "card bo 8px, không shadow") để DeepSeek tự viết lại bằng codebase hiện có

---

## 📋 VÍ DỤ NGẮN (minh họa)

```markdown
## 1. TỔNG QUAN
- Tên web mẫu: Linear.app dashboard
- Loại app: SaaS project management
- Cảm giác: tối giản, chuyên nghiệp, tối

## 2. LAYOUT
- Sidebar trái 240px, cố định
- Header 56px, sticky, có search + avatar
- Main: 1 cột content rộng + panel phải 320px (chi tiết)

## 3. COLOR PALETTE
| Vai trò | HEX |
|---|---|
| Background | #0a0a0a |
| Card | #171717 |
| Accent | #5e6ad2 |
| Text chính | #f0f0f0 |
| Text muted | #a0a0a0 |
| Border | #262626 |

## 4. TYPOGRAPHY
- Font: Inter
- H1: 24px / 700
- Body: 14px / 400 / line-height 1.5

## 5. COMPONENT
- Card: bo 8px, viền 1px #262626, KHÔNG shadow
- Button primary: bo 6px, padding 8px 16px, bg #5e6ad2
- Input: bo 6px, bg #171717, viền #262626, focus viền accent

## 7. ĐẶC BIỆT
- Không dùng gradient
- Icon line 16px
- Hover sáng lên 5%

## 8. ÁP DỤNG CHO FPC HUB
- Đổi màu nền sang tông tối hơn (#0a0a0a) cho giống Linear
- Card bỏ shadow, dùng viền mảnh
- Accent giữ tím hiện tại hoặc đổi sang #5e6ad2
```

---

*Template này do DeepSeek tạo cho workflow "Sếp → Gemini vision → blueprint → DeepSeek code" của dự án FPC HUB v15.*
