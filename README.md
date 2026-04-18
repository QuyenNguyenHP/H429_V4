# H429 Monitoring System 🚢

Hệ thống giám sát H429 gồm:
- `backend/` FastAPI + importer cho dữ liệu CSV/ZIP
- `frontend/` dashboard HTML tĩnh
- `deploy/` tài liệu và mẫu deploy

## Cấu trúc chính 📁

```text
H429_v3/
  backend/
  frontend/
  deploy/
  README.md
```

## Thành phần chính 🧩

### Backend ⚙️
- Chạy API tại `http://127.0.0.1:8888`
- Đọc dữ liệu từ SQLite `backend/h429_data.db`
- Tự chạy importer từ `backend/import_new_data_to_database.py`

### Frontend 🖥️
- Chạy static server tại `http://localhost:5170`
- Trang chính:
  - `index.html`
  - `dg_dashboard.html`
  - `me_dashboard.html`
  - `3DGs_graph.html`

### Deploy 🚀
- Có mẫu `systemd` trong `deploy/systemd/`
- Có tài liệu triển khai thực tế trong `deploy/deployment_recommendations.md`

## Chạy local ▶️

### Backend

```bash
cd backend
python3 run.py
```

Backend hiện listen local only:

- `127.0.0.1:8888` 🔒

### Frontend

```bash
cd frontend
python3 -m http.server 5170 --bind 0.0.0.0
```

Mở:

- `http://localhost:5170/index.html`

## API đang dùng 🔌

Frontend hiện dùng các API chính:

- `GET /api/check_all_status_lable/all`
- `GET /api/check_all_status_lable/index`
- `GET /api/check_all_status_lable/snapshot`
- `GET /api/engine_graph`
- `GET /api/engine_graph/pms`

## Import dữ liệu 📥

Importer hiện:
- theo dõi `backend/arrived_data`
- nhận file `.csv` hoặc `.zip`
- giải nén CSV nếu cần
- cập nhật `live_engine_data`
- lưu lịch sử vào `Stored_database`
- gom file đã xử lý vào `backend/archived_csv`

## Deploy gợi ý 🛡️

Khuyến nghị thực tế:
- chỉ public `80/443`
- không public trực tiếp `5170` và `8888`
- dùng reverse proxy phía trước
- backend nên bind nội bộ `127.0.0.1:8888`

## Ghi chú 📝

- Tên file dashboard DG/ME hiện tại là:
  - `frontend/dg_dashboard.html`
  - `frontend/me_dashboard.html`
- Một số tài liệu hoặc file backup cũ có thể vẫn còn tên cũ như `Engine_graph.html` hoặc `ME_dashboard.html`, nhưng không còn là luồng active.
