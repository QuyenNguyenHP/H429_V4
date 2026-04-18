from __future__ import annotations

import signal
import subprocess
import sys
from pathlib import Path

from app.main import app


BASE_DIR = Path(__file__).resolve().parent
IMPORTER_PATH = BASE_DIR / "import_new_data_to_database.py"


def start_importer() -> subprocess.Popen | None:
    if not IMPORTER_PATH.exists():
        return None

    kwargs: dict[str, object] = {
        "args": [sys.executable, str(IMPORTER_PATH)],
        "cwd": str(BASE_DIR),
    }
    if sys.platform.startswith("win"):
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]

    return subprocess.Popen(**kwargs)


def stop_importer(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    importer_proc = start_importer()

    def handle_stop(signum, frame) -> None:
        stop_importer(importer_proc)
        raise KeyboardInterrupt

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, handle_stop)
        except Exception:
            pass

    try:
        uvicorn.run(app, host="127.0.0.1", port=8888, reload=False)
    finally:
        stop_importer(importer_proc)
