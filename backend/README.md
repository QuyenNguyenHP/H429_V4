# Backend ⚙️

FastAPI backend cho hệ thống giám sát H429.

## Thành phần active 📦

```text
backend/
  app/
    api/
      Check_all_status_lable.py
      engine_graph.py
    services/
      live_service.py
    config.py
    db.py
    main.py
    models.py
    schemas.py
  arrived_data/
  archived_csv/
  import_new_data_to_database.py
  h429_data.db
  run.py
```

## API đang dùng ✅

Các API đang được frontend active gọi:

- `GET /api/check_all_status_lable/all`
- `GET /api/check_all_status_lable/index`
- `GET /api/check_all_status_lable/snapshot`
- `GET /api/engine_graph`
- `GET /api/engine_graph/pms`

## API đã bỏ 🧹

Các API legacy không còn dùng và đã được xóa:

- `GET /api/timestamp`
- `GET /api/system/health`
- `GET /api/system/status`
- `GET /api/load_trend`
- `GET /api/cylinder_exh`

## `engine_graph` hiện xử lý gì 📊

`/api/engine_graph` hiện là API trend trung tâm cho:

- `graph_type=load`
- `graph_type=load_detail`
- `graph_type=cylinder_exh`
- `graph_type=tc_exh`

`/api/engine_graph/pms` dùng để trả snapshot PMS:

- `power_kw`
- `current`
- `voltage`
- `frequency`

Theo từng:
- `DG#1`
- `DG#2`
- `DG#3`

## Database 🗄️

Runtime database:

- `backend/h429_data.db`

Bảng chính:

- `live_engine_data`
- `Stored_database`

## Importer 📥

Script:

- `backend/import_new_data_to_database.py`

Behavior:

- theo dõi `backend/arrived_data`
- nhận `.csv` và `.zip`
- giải nén CSV từ file zip
- thay toàn bộ dữ liệu `live_engine_data`
- append lịch sử vào `Stored_database`
- ghi archive vào `backend/archived_csv`
- xóa file nguồn sau khi xử lý xong

### Chạy một lần

```bash
cd backend
python3 import_new_data_to_database.py --once
```

### Chạy liên tục

```bash
cd backend
python3 import_new_data_to_database.py
```

## Chạy backend ▶️

```bash
cd backend
python3 run.py
```

`run.py` sẽ chạy:
- FastAPI server trên port `8888`
- importer background

## Kiểm tra nhanh 🔎

```powershell
Invoke-RestMethod -Uri "http://localhost:8888/api/check_all_status_lable/all" -Method Get | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "http://localhost:8888/api/check_all_status_lable/index" -Method Get | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "http://localhost:8888/api/engine_graph?from=2026-04-17T00:00:00Z&to=2026-04-18T00:00:00Z&graph_type=load&dg_names=DG%231" -Method Get | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "http://localhost:8888/api/engine_graph/pms?timestamp=2026-04-18T00:00:00Z" -Method Get | ConvertTo-Json -Depth 6
```

## Ghi chú 📝

- Backend hiện dùng `engine_graph.py` làm đầu mối cho trend API.
- PMS đã được gom vào backend hiện tại, không còn API riêng kiểu cũ nữa.
