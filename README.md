# H429 Monitoring System

Repo nay chua he thong giam sat H429 gom backend FastAPI, frontend dashboard tinh, va tai lieu deploy cho Raspberry Pi kiosk.

## Cau truc repo

```text
H429_V4/
  backend/
  frontend/
  deploy/
  README.md
```

## Tong quan nhanh

- `backend/`: API FastAPI, importer, xu ly du lieu SQLite
- `frontend/`: cac trang dashboard HTML/CSS/JS tinh
- `deploy/`: tai lieu deploy, reverse proxy, kiosk mode

## Backend

- API local mac dinh: `http://127.0.0.1:8888`
- Du lieu nguon: `backend/h429_data.db`
- Script chay API: `backend/run.py`
- Importer chinh: `backend/import_new_data_to_database.py`

### Chay backend local

```bash
cd backend
python3 run.py
```

## Frontend

- Static server local mac dinh: `http://localhost:5170`
- Cac trang active:
  - `frontend/index.html`
  - `frontend/dg_dashboard.html`
  - `frontend/ME_dashboard.html`
  - `frontend/3DGs_graph.html`

### Chay frontend local

```bash
cd frontend
python3 -m http.server 5170 --bind 0.0.0.0
```

Mo:

- `http://localhost:5170/index.html`

## Trang va bo cuc hien tai

### `frontend/index.html`

- Da bo tu duy canvas co dinh `1920x1080`
- Dung responsive CSS theo `body.index-page`
- Nav trai la overlay, khong lam co vung noi dung
- Trang chu dung asset nhe `engine_mainpage_kiosk.png`

### `frontend/dg_dashboard.html`

- Dung responsive fullscreen CSS theo `body.dg-page`
- Bo cuc scene dung CSS grid:
  - `engine`
  - `LOAD`
  - `T/C EXH`
  - `CYLINDER TEMP`
- Overlay trong engine da duoc tach thanh `.engine-overlay-layer`
- Vi tri overlay desktop duoc dieu khien 100% boi `UI_LAYOUT`
- Anh engine theo theme:
  - `engine_light_kiosk.png`
  - `engine_dark_kiosk.png`
  - `engine_running_kiosk.png`

### `frontend/ME_dashboard.html`

- Da duoc dua ve cung huong responsive/fullscreen voi DG
- Bo cuc dung CSS grid:
  - `engine`
  - `analog`
  - `digital`
- Overlay tren engine dung `UI_LAYOUT` rieng cua ME

### `frontend/3DGs_graph.html`

- Da duoc dua ve cung khung header/padding/fullscreen voi DG
- Phan than trang chia 2 tang:
  - chart chinh o tren
  - running hours + PMS o duoi

### `frontend/dashboard_shared.js`

- Chua logic shared cho nav, helper fetch, layout helper
- Global nav tu auto collapse sau 5 giay

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

## Kiosk deploy

Tai lieu chinh:

- `deploy/raspberry_pi_kiosk_deploy.md`

Trang thai kiosk hien tai:

- Chromium duoc mo sau khi web va API da san sang
- Kiosk dung `--user-data-dir` rieng de profile/cache on dinh
- Da bo `--incognito`
- Da uu tien asset nhe de giam cold start

Y tuong chinh trong script kiosk:

- doi `http://127.0.0.1/` san sang bang `curl -fsS`
- doi health endpoint API san sang
- mo Chromium fullscreen kiosk sau do

## Frontend tuning guide

Phan nay la ghi chu quan trong de tinh chinh giao dien ma khong phai doan tung file.

### 1. Chinh kich thuoc section trong DG dashboard

File:

- `frontend/app.css`

Block chinh:

```css
body.dg-page #dg-scene-stage {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(0, 1.1fr);
    grid-template-rows: minmax(0, 1.12fr) minmax(0, 0.88fr);
    grid-template-areas:
        "engine trend-top"
        "trend-left trend-right";
}
```

Y nghia:

- `grid-template-columns`: doi do rong `engine` so voi cot ben phai
- `grid-template-rows`: doi do cao hang tren so voi hang duoi
- `gap`: doi khoang cach giua cac section

Quy tac nhanh:

- muon `engine` rong hon: tang gia tri cot trai
- muon `LOAD` cao hon: tang gia tri hang tren
- muon 2 chart duoi cao hon: tang gia tri hang duoi

### 2. Chinh vi tri overlay trong DG engine

File:

- `frontend/dg_dashboard.html`

Block chinh:

```js
const UI_LAYOUT = {
    baseWidth: 1000,
    cylinders: [
        { x: '40.5%', y: '20%', scale: 1.0 },
        ...
    ],
    panels: {
        engineSpeed: { x: '18%', y: '50%', scale: 1.2 },
        runningHour: { x: '59%', y: '75%', scale: 1.1, anchor: 'right' },
        load: { x: '80%', y: '75%', scale: 1.1, anchor: 'right' }
    },
    tags: {
        'starting-air': { x: '39%', y: '30%', scale: 1.2, labelWidth: '200px', valueWidth: '60px' },
        ...
    }
};
```

Y nghia:

- `x`: vi tri ngang
- `y`: vi tri doc
- `scale`: phong to / thu nho item
- `labelWidth`: do rong phan label cua `data-tag`
- `valueWidth`: do rong phan value cua `data-tag`
- `anchor: 'right'`: canh panel theo mep phai khi apply layout

Dung cho:

- `cylinders`: cac the cylinder temp
- `panels.engineSpeed`: the `ENGINE SPEED`
- `panels.runningHour`: the `RUNNING HOURS`
- `panels.load`: the `LOAD`
- `tags`: tat ca `data-tag`

Luu y:

- Khong can sua `left/top` inline trong HTML nua
- Desktop overlay hien tai bam theo `.engine-overlay-layer`
- Layout desktop duoc tinh lai trong `applyUILayout()`

### 3. Chinh do rong co dinh cua card DG

File:

- `frontend/app.css`

Block chinh:

```css
#panel-engine-speed .metric-card {
    width: 170px;
}

#panel-running-hour .metric-card,
#panel-load .metric-card {
    width: 272px;
}
```

Dung khi:

- da thay doi `scale` nhung van muon card rong hon / hep hon
- text trong card bi chat theo chieu ngang

### 4. Chinh co chu va kich thuoc noi dung overlay

File:

- `frontend/app.css`

Block lien quan:

```css
.engine-container .metric-label
.engine-container .metric-value
.data-tag .label-box
.data-tag .digital-value
.cyl-item .cyl-label
.cyl-item .digital-value
```

Dung khi:

- muon doi font-size chung
- muon doi chieu cao dong
- muon label/value trong the can doi hon

### 5. Overlay layer trong DG engine

File:

- `frontend/dg_dashboard.html`
- `frontend/app.css`

Overlay DG hien tai da tach thanh:

- `.engine-overlay-layer`
- `.engine-overlay-panel`
- `.cylinder-layer`

Loi ich:

- de nhin cau truc
- de dam bao card/tag/cylinder bam theo engine section
- de sau nay chi sua `UI_LAYOUT` la du

### 6. Chinh overlay trong ME dashboard

File:

- `frontend/ME_dashboard.html`

ME dung cung y tuong voi DG:

- vi tri va scale cua card/tag/cylinder nam trong `UI_LAYOUT`
- section lon duoc dieu khien boi CSS grid trong `frontend/app.css`

### 7. Responsive breakpoint can luu y

File:

- `frontend/app.css`

Breakpoint quan trong:

- `max-width: 1500px`
- `max-width: 1280px`
- `max-height: 860px`
- `max-width: 820px`

Khi tinh chinh desktop, nen kiem tra them:

- man 1920x1080
- man 1366x768
- kiosk fullscreen tren Pi

## Quy tac sua layout de tranh vo giao dien

- doi layout tong the section o `app.css`
- doi vi tri overlay engine o `UI_LAYOUT`
- doi do to overlay uu tien bang `scale` truoc
- chi doi `width` CSS co dinh khi thuc su can
- tranh quay lai cach dat `left/top` bang px cho desktop

## File nen xem truoc khi sua

- `frontend/index.html`
- `frontend/dg_dashboard.html`
- `frontend/ME_dashboard.html`
- `frontend/3DGs_graph.html`
- `frontend/app.css`
- `frontend/dashboard_shared.js`
- `deploy/raspberry_pi_kiosk_deploy.md`

## Tai lieu deploy lien quan

- `deploy/deployment_recommendations.md`
- `deploy/raspberry_pi_kiosk_deploy.md`
