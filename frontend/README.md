# Frontend

Static frontend pages for the H429 monitoring system.

The frontend is file-based and talks to the FastAPI backend over HTTP. It provides:

- a home overview for all major machines
- detailed DG dashboards
- detailed main engine dashboards
- a DG load trend page with time-range filtering and timezone-aware display
- a cylinder exhaust trend page with six cylinder series

## Active Pages

### `index.html`

Home page for the vessel overview.

Main features:

- shows the five main machine cards: `DG#1`, `DG#2`, `DG#3`, `ME-PORT`, and `ME-STBD`
- displays high-level status indicators such as ready, running, alarm, and connection state
- provides quick navigation into the machine-specific detail pages
- shows a live date/time header

API usage:

- `GET /api/check_all_status_lable/all`

### `Engine_graph.html`

Detailed dashboard for a diesel generator.

Routing:

- `Engine_graph.html?dg=1`
- `Engine_graph.html?dg=2`
- `Engine_graph.html?dg=3`

Main features:

- shows DG-specific analog and digital points
- updates header lights and alarm state
- displays the latest timestamp for the selected DG
- allows switching between DG pages from inside the dashboard
- provides navigation to the DG load trend page

API usage:

- `GET /api/check_all_status_lable/all`
- `GET /api/timestamp?dg_name=...`

### `ME_dashboard.html`

Detailed dashboard for a main engine page.

Routing:

- `ME_dashboard.html?dg=ME-PORT`
- `ME_dashboard.html?dg=ME-STBD`

Main features:

- shows analog and digital values for the selected main engine
- updates running/ready/alarm indicators
- displays the latest available timestamp in the page header
- allows switching between `ME-PORT` and `ME-STBD`

API usage:

- `GET /api/check_all_status_lable/all`

### `3DGs_graph.html`

DG load trend page.

Main features:

- plots DG load history over a selected time range
- supports selecting one or more DGs
- keeps the response capped to a maximum number of points for performance
- uses the browser timezone for display while keeping backend/API requests in UTC
- supports wheel zoom, right-click drag panning, and double-click reset to the selected full range
- caches recent trend responses in session storage for faster repeat loads

Primary script:

- `Load_graph.js`

API usage:

- `GET /api/load_trend?from=...&to=...&dg_names=...&max_points=...`

### `Cyl_exh_graph.html`

Cylinder exhaust trend page.

Main features:

- plots six cylinder exhaust temperature series for a selected DG
- supports enabling or disabling each cylinder line independently
- keeps the response capped to a maximum number of points for performance
- uses the browser timezone for display while keeping backend/API requests in UTC
- supports wheel zoom, right-click drag panning, and double-click reset to the selected full range

Primary script:

- `Cyl_exh_graph.js`

API usage:

- `GET /api/cylinder_exh?from=...&to=...&dg_name=...&max_points=...`

## Shared Frontend Files

### `app.css`

Shared styling used across the frontend pages.

### `dashboard_shared.js`

Shared helpers for:

- backend origin resolution
- lightweight fetch-with-timeout handling
- common utility methods for DOM access and DG-name normalization

## Assets

The `Asset/` directory contains images and visual resources used by the dashboards, such as:

- DRUMS logos
- engine illustrations
- page-specific visual assets

## Local Run

Serve the frontend from the `frontend/` directory with any static file server.

Example using Python:

```bash
cd frontend
python -m http.server 5170 --bind 0.0.0.0
```

Then open:

- `http://localhost:5170/index.html`
- `http://localhost:5170/Engine_graph.html?dg=1`
- `http://localhost:5170/ME_dashboard.html?dg=ME-PORT`
- `http://localhost:5170/3DGs_graph.html`
- `http://localhost:5170/Cyl_exh_graph.html`

The backend is expected to be available at:

- `http://localhost:8888`

You can override the frontend API target by defining `window.API_BASE_URL` or `window.APP_CONFIG.apiBaseUrl` before the page scripts run.

## Notes

- `DGs_dashboard.html.bak` is an inactive backup file that may still contain older API references and is not part of the active UI flow.
- The current frontend primarily uses inline page scripts plus `dashboard_shared.js`.
