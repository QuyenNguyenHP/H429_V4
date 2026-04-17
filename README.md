# Engine Touchscreen App

H429 monitoring system with a FastAPI backend, static frontend dashboards, and a local CSV/ZIP importer.

## Structure

```text
H429_v2/
  backend/
    app/
    archived_csv/
    arrived_data/
    data/
    h429_data.db
    import_new_data_to_database.py
    run.py
  frontend/
    index.html
    Engine_graph.html
    ME_dashboard.html
  iot_send_data__to_server/
  h429_date.examble.db
  README.md
```

## Runtime

- Backend API: `http://localhost:8888`
- Active database: `backend/h429_data.db`
- Schema-only example database: `h429_date.examble.db`

Start the backend with:

```bash
cd backend
python3 run.py
```

`run.py` starts the FastAPI server and also launches `backend/import_new_data_to_database.py`.

## Import Flow

The importer watches `backend/arrived_data` every 3 seconds.

- If a `.csv` file arrives, it is read directly.
- If a `.zip` file arrives, all CSV files inside are extracted and merged.
- All imported rows are merged into one archived CSV file in `backend/archived_csv`.
- Table `live_engine_data` is fully replaced on each successful import.
- Table `Stored_database` keeps all historical inserted rows.
- Processed files are deleted from `backend/arrived_data`.

## Database Schema

Both `backend/h429_data.db` and `h429_date.examble.db` use the same table structure:

### `live_engine_data`

| Column | Type |
| --- | --- |
| `imo` | `INTEGER` |
| `serial` | `TEXT` |
| `dg_name` | `TEXT` |
| `addr` | `TEXT` |
| `label` | `TEXT` |
| `timestamp` | `DATETIME` |
| `val` | `REAL` |
| `unit` | `TEXT` |

### `Stored_database`

| Column | Type |
| --- | --- |
| `imo` | `INTEGER` |
| `serial` | `TEXT` |
| `dg_name` | `TEXT` |
| `addr` | `TEXT` |
| `label` | `TEXT` |
| `timestamp` | `DATETIME` |
| `val` | `REAL` |
| `unit` | `TEXT` |

## Frontend APIs

- `frontend/index.html`
  - `GET /api/check_all_status_lable/all`
- `frontend/Engine_graph.html`
  - `GET /api/check_all_status_lable/all`
  - `GET /api/timestamp?dg_name=...`
- `frontend/ME_dashboard.html`
  - `GET /api/check_all_status_lable/all`

## Notes

- `backend/h429_data.db` is the runtime SQLite database used by the backend and importer.
- `h429_date.examble.db` is intended for sharing schema without bundling runtime data.
