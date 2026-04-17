# Backend

FastAPI backend for H429 monitoring.

## Active Files

```text
backend/
  app/
    api/
      Check_all_status_lable.py
      system.py
      timestamp.py
    services/
      live_service.py
      system_service.py
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

## APIs

- `GET /api/check_all_status_lable/all`
- `GET /api/timestamp`
- `GET /api/system/health`
- `GET /api/system/status`

## Database

Configured in [config.py](</c:/Users/Quyen PC/Desktop/My Repo/H429/backend/app/config.py:7>).

Runtime database:

- `backend/h429_data.db`

Tables:

- `live_engine_data`
- `Stored_database`

## Importer

Script: [import_new_data_to_database.py](</c:/Users/Quyen PC/Desktop/My Repo/H429/backend/import_new_data_to_database.py:1>)

Behavior:

- Watches `backend/arrived_data` every 3 seconds
- Accepts `.csv` and `.zip`
- Extracts CSV files from zip archives
- Merges all rows into one archived CSV file in `backend/archived_csv`
- Replaces all rows in `live_engine_data`
- Appends imported rows into `Stored_database`
- Deletes processed source files from `arrived_data`

Run one cycle manually:

```bash
cd backend
python3 import_new_data_to_database.py --once
```

Run continuously:

```bash
cd backend
python3 import_new_data_to_database.py
```

## Start Backend

```bash
cd backend
python3 run.py
```

`run.py` starts both:

- the FastAPI server on port `8131`
- the background importer process

## Quick Checks

```powershell
Invoke-RestMethod -Uri "http://localhost:8131/api/check_all_status_lable/all" -Method Get | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "http://localhost:8131/api/timestamp?dg_name=DG%231" -Method Get | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "http://localhost:8131/api/system/health" -Method Get | ConvertTo-Json -Depth 5
```
