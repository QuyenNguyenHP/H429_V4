# Frontend 🖥️

Frontend là tập các trang HTML tĩnh cho dashboard H429.

## Trang active 🌐

### `index.html` 🏠
- Trang tổng quan toàn hệ thống
- Hiển thị:
  - `DG#1`, `DG#2`, `DG#3`
  - `ME-PORT`, `ME-STBD`
  - 3 card `PMS`
- Có sidebar menu chung
- Dùng `UI_LAYOUT` để chỉnh vị trí các section trên trang chủ

API dùng:
- `GET /api/check_all_status_lable/index`
- fallback PMS từ `GET /api/check_all_status_lable/all`

### `dg_dashboard.html` 🔵
- Dashboard chi tiết cho DG
- Route:
  - `dg_dashboard.html?dg=1`
  - `dg_dashboard.html?dg=2`
  - `dg_dashboard.html?dg=3`
- Có:
  - overlay giá trị trên ảnh máy
  - bảng `Digital Value`
  - embedded trend chart
  - điều hướng sang `3DGs_graph.html`

API dùng:
- `GET /api/check_all_status_lable/snapshot?dg_name=...`
- `GET /api/engine_graph`

### `me_dashboard.html` 🟢
- Dashboard chi tiết cho main engine
- Route:
  - `me_dashboard.html?dg=ME-PORT`
  - `me_dashboard.html?dg=ME-STBD`
- Có:
  - overlay tag trên ảnh máy
  - bảng `Analog Value`
  - bảng `Digital Value`
- Vị trí UI chỉnh qua `UI_LAYOUT`

API dùng:
- `GET /api/check_all_status_lable/snapshot?dg_name=...`

### `3DGs_graph.html` 📈
- Trang trend cho 3 DG
- Đã tách thành 2 section lớn:
  - section filter + `LOAD`
  - section `DGs Running Hours` + `PMS`
- Có:
  - chọn thời gian
  - chọn `DG#`
  - nút `Prev 24h / Next 24h / Apply`
  - chọn điểm trên đồ thị để sync `PMS`
  - `Esc` để reset điểm chọn
  - zoom bằng nút kính lúp `+ / -`
  - pan chart bằng chuột trái

Script chính:
- `dg_load_trend.js`

API dùng:
- `GET /api/engine_graph?graph_type=load`
- `GET /api/engine_graph/pms`
- `GET /api/check_all_status_lable/all`

### `Cyl_exh_graph.html` 🌡️
- Trang trend nhiệt độ exhaust
- Có:
  - chọn DG
  - chọn cylinder
  - zoom/pan chart
  - hiển thị theo browser timezone

Script chính:
- `Cyl_exh_graph.js`

API dùng:
- `GET /api/engine_graph?graph_type=cylinder_exh`

## File dùng chung ♻️

### `app.css`
- CSS dùng chung toàn frontend
- chứa style cho:
  - `main-container`
  - sidebar menu
  - home cards
  - dashboard tables

### `dashboard_shared.js`
- helper dùng chung cho frontend:
  - resolve backend origin
  - fetch with timeout
  - global sidebar menu
  - helper pan / zoom / reset viewport cho chart

## Chạy local ▶️

```bash
cd frontend
python3 -m http.server 5170 --bind 0.0.0.0
```

Mở:

- `http://localhost:5170/index.html`
- `http://localhost:5170/dg_dashboard.html?dg=1`
- `http://localhost:5170/me_dashboard.html?dg=ME-PORT`
- `http://localhost:5170/3DGs_graph.html`
- `http://localhost:5170/Cyl_exh_graph.html`

## Ghi chú 📝

- File active hiện tại là:
  - `dg_dashboard.html`
  - `me_dashboard.html`
- Các tên cũ như `Engine_graph.html` và `ME_dashboard.html` không còn là file active.
- `DGs_dashboard.html.bak` chỉ là file backup cũ, không thuộc luồng chạy hiện tại.
