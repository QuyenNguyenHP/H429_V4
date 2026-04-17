import argparse
import csv
import datetime as dt
import logging
import shutil
import signal
import sqlite3
import threading
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

POLL_INTERVAL_SECONDS = 3
ARRIVED_DIR = BASE_DIR / "arrived_data"
ARCHIVED_DIR = BASE_DIR / "archived_csv"
DB_PATH = BASE_DIR / "h429_data.db"

DG_ORDER = {"DG#1": 1, "DG#2": 2, "DG#3": 3, "ME-PORT": 4, "ME-STBD": 5}
DG_PREFIXES = ("DG#1", "DG#2", "DG#3", "ME-PORT", "ME-STBD", "ME_PORT", "ME_STBD", "PMS")
DG_PREFIXES_NO_PMS = ("DG#1", "DG#2", "DG#3", "ME-PORT", "ME-STBD", "ME_PORT", "ME_STBD")


def normalize_dg_name(value: str) -> str:
    normalized = str(value).strip()
    if normalized.upper() in {"ME_PORT", "ME_STBD"}:
        normalized = normalized.replace("_", "-")
    return normalized


def split_dg_name_from_label(label: str) -> tuple[str, str]:
    normalized_label = str(label).strip()

    for prefix in DG_PREFIXES_NO_PMS:
        if normalized_label.startswith(prefix + " "):
            return normalize_dg_name(prefix), normalized_label[len(prefix) + 1 :].strip()

    if normalized_label.startswith("PMS "):
        remainder = normalized_label[len("PMS ") :].strip()
        for prefix in DG_PREFIXES_NO_PMS:
            if remainder.startswith(prefix + " "):
                return normalize_dg_name(prefix), remainder[len(prefix) + 1 :].strip()
        return "PMS", remainder

    return "", normalized_label


def parse_row(row: list[str]) -> tuple | None:
    row = [col.strip() for col in row]
    if not row or all(col == "" for col in row):
        return None

    try:
        imo_val = int(float(row[0]))
    except Exception:
        return None

    if len(row) == 7:
        imo, serial, addr, label, timestamp, val, unit = row
        dg_name = ""
    elif len(row) == 8:
        imo, serial, dg_name, addr, label, timestamp, val, unit = row
    elif len(row) >= 9:
        imo, serial, addr, label, ts1, ts2, val1, val2, unit = row[:9]
        timestamp = ts2 or ts1
        val = val2 or val1
        dg_name = ""
    else:
        return None

    label = str(label).strip()
    dg_name = normalize_dg_name(str(dg_name).strip())

    if label.startswith("PMS "):
        if dg_name in {"", "PMS"}:
            dg_name = "PMS"
            label = label[len("PMS ") :].strip()
        else:
            detected_dg_name, stripped_label = split_dg_name_from_label(label)
            if detected_dg_name == dg_name:
                label = stripped_label
    if dg_name:
        if not label.startswith("PMS "):
            detected_dg_name, stripped_label = split_dg_name_from_label(label)
            if detected_dg_name == dg_name:
                label = stripped_label
            elif dg_name.upper() == "PMS" and label.startswith("PMS "):
                label = label[len("PMS ") :].strip()
    else:
        if label.startswith("PMS "):
            dg_name = "PMS"
            label = label[len("PMS ") :].strip()
        else:
            dg_name, label = split_dg_name_from_label(label)

    if str(serial).strip() == "" or str(addr).strip() == "" or str(label).strip() == "":
        return None

    if dg_name == "":
        dg_name = "UNKNOWN"

    try:
        val_num = float(val) if str(val).strip() != "" else None
    except Exception:
        val_num = None

    return (imo_val, serial, dg_name, str(addr), label, timestamp, val_num, unit)


def sort_key(row: tuple) -> tuple:
    dg_name = row[2]
    addr = row[3]
    addr_key = int(addr) if str(addr).isdigit() else addr
    return (DG_ORDER.get(dg_name, 99), row[1], addr_key)


def ensure_directories() -> None:
    ARRIVED_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVED_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS live_engine_data (
            imo INTEGER,
            serial TEXT,
            dg_name TEXT,
            addr TEXT,
            label TEXT,
            timestamp DATETIME,
            val REAL,
            unit TEXT
        );
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS Stored_database (
            imo INTEGER,
            serial TEXT,
            dg_name TEXT,
            addr TEXT,
            label TEXT,
            timestamp DATETIME,
            val REAL,
            unit TEXT
        );
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_stored_label_dg_timestamp
        ON Stored_database(label COLLATE NOCASE, dg_name, timestamp);
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_stored_dg_timestamp
        ON Stored_database(dg_name, timestamp);
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_live_dg_addr_timestamp
        ON live_engine_data(dg_name, addr, timestamp);
        """
    )
    conn.commit()


def list_arrived_files() -> list[Path]:
    files: list[Path] = []
    for pattern in ("*.csv", "*.zip"):
        files.extend(path for path in ARRIVED_DIR.glob(pattern) if path.is_file())
    return sorted(files, key=lambda path: (path.stat().st_mtime, path.name))


def extract_zip_csvs(zip_path: Path, temp_root: Path) -> list[Path]:
    extracted_paths: list[Path] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_members = [info for info in zf.infolist() if not info.is_dir() and info.filename.lower().endswith(".csv")]
        if not csv_members:
            raise ValueError(f"No CSV file found inside zip: {zip_path.name}")
        for index, member in enumerate(csv_members, start=1):
            member_name = Path(member.filename).name
            extracted_path = temp_root / f"{zip_path.stem}_{index}_{member_name}"
            with zf.open(member, "r") as src, extracted_path.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            extracted_paths.append(extracted_path)
    return extracted_paths


def collect_csv_sources(files: list[Path], temp_root: Path) -> list[Path]:
    csv_sources: list[Path] = []
    for path in files:
        suffix = path.suffix.lower()
        if suffix == ".csv":
            csv_sources.append(path)
            continue
        if suffix == ".zip":
            csv_sources.extend(extract_zip_csvs(path, temp_root))
    return csv_sources


def read_parsed_rows(paths: list[Path]) -> list[tuple]:
    parsed_rows: list[tuple] = []
    importable_rows = 0

    for path in paths:
        with path.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.reader(handle)
            for row in reader:
                parsed = parse_row(row)
                if not parsed:
                    continue
                parsed_rows.append(parsed)
                importable_rows += 1

    if paths and importable_rows == 0:
        raise ValueError("Files found in arrived_data but no importable rows were detected")

    parsed_rows.sort(key=sort_key)
    return parsed_rows


def write_merged_csv(rows: list[tuple]) -> Path:
    timestamp_suffix = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    merged_path = ARCHIVED_DIR / f"H429_merged_{timestamp_suffix}.csv"
    with merged_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)
    return merged_path


def replace_live_and_append_history(conn: sqlite3.Connection, rows: list[tuple]) -> None:
    conn.execute("DELETE FROM live_engine_data;")
    conn.executemany(
        """
        INSERT INTO live_engine_data (imo, serial, dg_name, addr, label, timestamp, val, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """,
        rows,
    )
    conn.executemany(
        """
        INSERT INTO Stored_database (imo, serial, dg_name, addr, label, timestamp, val, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """,
        rows,
    )
    conn.commit()


def cleanup_processed_files(files: list[Path], temp_root: Path) -> None:
    for path in files:
        try:
            if path.exists():
                path.unlink()
        except Exception:
            logging.exception("Failed to delete source file %s", path)

    if temp_root.exists():
        shutil.rmtree(temp_root, ignore_errors=True)


def process_single_file(path: Path, conn: sqlite3.Connection) -> bool:
    temp_root = ARRIVED_DIR / f"_tmp_extract_{path.stem}"
    if temp_root.exists():
        shutil.rmtree(temp_root, ignore_errors=True)
    temp_root.mkdir(parents=True, exist_ok=True)

    try:
        csv_sources = collect_csv_sources([path], temp_root)
        rows = read_parsed_rows(csv_sources)
        merged_csv_path = write_merged_csv(rows)
        replace_live_and_append_history(conn, rows)
        cleanup_processed_files([path], temp_root)
        logging.info("Processed %s with %s rows into %s", path.name, len(rows), DB_PATH.name)
        logging.info("Saved merged CSV: %s", merged_csv_path.name)
        return True
    finally:
        if temp_root.exists():
            shutil.rmtree(temp_root, ignore_errors=True)


def process_once() -> bool:
    ensure_directories()
    files = list_arrived_files()
    if not files:
        return False

    processed_any = False
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        while True:
            files = list_arrived_files()
            if not files:
                break
            next_file = files[0]
            process_single_file(next_file, conn)
            processed_any = True
        return processed_any
    finally:
        conn.close()


def run_watch(interval_seconds: int, stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            process_once()
        except Exception:
            logging.exception("Import cycle failed")
        stop_event.wait(interval_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Watch backend/arrived_data, merge CSV payloads, and import them into backend/h429_data.db"
    )
    parser.add_argument("--once", action="store_true", help="Run a single import cycle and exit.")
    parser.add_argument(
        "--interval",
        type=int,
        default=POLL_INTERVAL_SECONDS,
        help="Polling interval in seconds when running continuously.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.once:
        process_once()
        return

    stop_event = threading.Event()

    def handle_stop(signum, frame) -> None:
        logging.info("Stopping on signal %s", signum)
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, handle_stop)
        except Exception:
            pass

    run_watch(args.interval, stop_event)


if __name__ == "__main__":
    main()
