# H429 Monitoring System

He thong giam sat H429 gom:

- `backend/`: FastAPI API, importer, xu ly du lieu SQLite
- `frontend/`: cac trang dashboard HTML/CSS/JS tinh
- `deploy/`: tai lieu va mau trien khai

## Cau truc chinh

```text
H429_v3/
  backend/
  frontend/
  deploy/
  README.md
```

## Backend

- API local mac dinh: `http://127.0.0.1:8888`
- Du lieu nguon: `backend/h429_data.db`
- Script chay API: `backend/run.py`
- Importer chinh: `backend/import_new_data_to_database.py`

## Frontend

- Static server local mac dinh: `http://localhost:5170`
- Cac trang active:
  - `frontend/index.html`
  - `frontend/dg_dashboard.html`
  - `frontend/ME_dashboard.html`
  - `frontend/3DGs_graph.html`

Frontend hien tai da co cac thay doi chinh:

- responsive cho desktop, tablet, mobile
- trang chu `index.html` autosize theo noi dung, khong con phu thuoc section height co dinh
- overlay tren anh engine tu scale theo kich thuoc hien thi cua anh
- dark mode da doi nen vung engine sang tong toi
- chart mac dinh mo theo `MaxTimestamp - 10h` den `MaxTimestamp`
- so diem mac dinh cua trend chart da giam xuong `300`

## Chay local

### Backend

```bash
cd backend
python3 run.py
```

### Frontend

```bash
cd frontend
python3 -m http.server 5170 --bind 0.0.0.0
```

Mo:

- `http://localhost:5170/index.html`

## API frontend dang dung

- `GET /api/check_all_status_lable/all`
- `GET /api/check_all_status_lable/index`
- `GET /api/check_all_status_lable/snapshot`
- `GET /api/engine_graph`
- `GET /api/engine_graph/pms`

`/api/engine_graph` hien ho tro cac `graph_type`:

- `load`
- `pms`
- `running_hour`
- `load_detail`
- `cylinder_exh`
- `tc_exh`

## Import du lieu

Importer hien:

- theo doi `backend/arrived_data`
- nhan file `.csv` hoac `.zip`
- giai nen CSV neu can
- cap nhat `live_engine_data`
- luu lich su vao `Stored_database`
- chuyen file da xu ly vao `backend/archived_csv`

## Deploy

Khuyen nghi:

- chi public `80/443`
- khong public truc tiep `5170` va `8888`
- dung reverse proxy phia truoc
- backend nen bind noi bo `127.0.0.1:8888`

Xem them:

- `deploy/deployment_recommendations.md`
- `deploy/raspberry_pi_kiosk_deploy.md`
