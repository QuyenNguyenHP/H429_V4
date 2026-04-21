# Frontend

Frontend la tap cac trang HTML/CSS/JS tinh cho dashboard H429.

## Trang active

### `index.html`

- Trang tong quan toan he thong
- Hien thi `DG#1`, `DG#2`, `DG#3`, `ME-PORT`, `ME-STBD`, va 3 card `PMS`
- Layout trang chu da chuyen sang autosize theo noi dung
- Man hinh nho se tu xuong cot de tranh chong layout

API dung:

- `GET /api/check_all_status_lable/index`
- fallback PMS tu `GET /api/check_all_status_lable/all`

### `dg_dashboard.html`

- Dashboard chi tiet cho DG
- Route:
  - `dg_dashboard.html?dg=1`
  - `dg_dashboard.html?dg=2`
  - `dg_dashboard.html?dg=3`
- Co:
  - overlay gia tri tren anh may
  - bang `Digital Value`
  - embedded trend chart
  - dieu huong sang `3DGs_graph.html`

Overlay tren anh engine hien tai:

- `Engine Speed`, `Running Hour`, `Load`
- `Cylinder`
- cac `data-tag`

Hanh vi moi:

- overlay tu scale theo kich thuoc hien thi thuc te cua anh engine
- dung `ResizeObserver` bam vao `engine-container` va `engine-background-image`
- dark mode da doi nen vung engine sang tong toi
- cylinder tag trong dark mode da bo nen trang va doi chu sang tong sang
- embedded trend mac dinh mo theo `MaxTimestamp - 10h` den `MaxTimestamp`
- embedded trend dung `max_points = 300`

API dung:

- `GET /api/check_all_status_lable/snapshot?dg_name=...`
- `GET /api/engine_graph`

### `ME_dashboard.html`

- Dashboard chi tiet cho main engine
- Route:
  - `ME_dashboard.html?dg=ME-PORT`
  - `ME_dashboard.html?dg=ME-STBD`
- Co:
  - overlay tag tren anh may
  - bang `Analog Value`
  - bang `Digital Value`

Hanh vi moi:

- overlay tren anh engine tu scale theo kich thuoc hien thi cua anh
- dung `ResizeObserver` de refresh overlay khi anh engine thay doi kich thuoc
- dark mode da doi nen vung engine sang tong toi
- cylinder tag da dong bo mau voi dark theme

API dung:

- `GET /api/check_all_status_lable/snapshot?dg_name=...`

### `3DGs_graph.html`

- Trang trend cho 3 DG
- Chart chinh co 2 mode:
  - `LOAD`
  - `PMS`
- Mac dinh khi mo trang:
  - mode `LOAD`
  - khoang thoi gian `MaxTimestamp - 10h` den `MaxTimestamp`
  - `max_points = 300`

Tinh nang:

- chon thoi gian
- chon `DG#`
- nut `LOAD / PMS`
- nut `Prev 24h / Next 24h / Apply`
- chon 1 diem du lieu tren chart de sync `PMS`
- `Esc` de reset diem chon
- zoom bang nut `+ / -`
- pan chart bang chuot trai

Script chinh:

- `dg_load_trend.js`

API dung:

- `GET /api/engine_graph?graph_type=load`
- `GET /api/engine_graph?graph_type=pms`
- `GET /api/engine_graph/pms`
- `GET /api/check_all_status_lable/all`

## File dung chung

### `app.css`

- CSS dung chung toan frontend
- chua style cho:
  - `main-container`
  - home cards
  - dashboard tables
  - responsive layout
  - dark theme cho vung engine va cylinder tag

### `dashboard_shared.js`

- helper dung chung:
  - resolve backend origin
  - fetch with timeout
  - pan / zoom / reset viewport cho chart
  - helper layout chung

## Chay local

```bash
cd frontend
python3 -m http.server 5170 --bind 0.0.0.0
```

Mo:

- `http://localhost:5170/index.html`
- `http://localhost:5170/dg_dashboard.html?dg=1`
- `http://localhost:5170/ME_dashboard.html?dg=ME-PORT`
- `http://localhost:5170/3DGs_graph.html`
