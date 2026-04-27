"""
Subprocess wrapper around the existing protocol-driven data acquisition
CLI app (the `main.py` that opens its own OpenCV window and writes
session_*.xlsx files into Hand_Movement_data/).

We do NOT modify that script — we just spawn it, then on stop we send a
graceful shutdown (SIGTERM on Unix, CTRL_BREAK on Windows) which lets
its `finally:` block call `session.save_session()` and flush the Excel.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Where your existing main.py / session.py / protocol.py live.
# Override with env var DATA_ACQ_DIR if your project sits elsewhere.
DATA_ACQ_DIR = Path(
    os.environ.get(
        "DATA_ACQ_DIR",
        # Default: sibling folder named "data_acquisition" next to brunnstrom_api/
        str(Path(__file__).resolve().parent.parent / "data_acquisition"),
    )
).resolve()

# Where the script writes session_*.xlsx (matches DataAcquisitionSession default)
OUTPUT_DIR = DATA_ACQ_DIR / "Hand_Movement_data"

# Python executable to use (use the same one running FastAPI by default)
PYTHON_EXE = os.environ.get("DATA_ACQ_PYTHON", sys.executable)


@dataclass
class RunningSession:
    process: subprocess.Popen
    started_at: float
    session_id: str  # best-effort placeholder; real id is in the produced filename
    log_path: Path
    pre_existing_files: set = field(default_factory=set)


_current: Optional[RunningSession] = None


def _tail_log(path: Path, limit: int = 2500) -> str:
    if not path.exists():
        return ""
    return path.read_text(errors="replace")[-limit:].strip()


def is_running() -> bool:
    return _current is not None and _current.process.poll() is None


def start() -> RunningSession:
    global _current
    if is_running():
        raise RuntimeError("A data acquisition session is already running.")

    if not (DATA_ACQ_DIR / "main.py").exists():
        raise FileNotFoundError(
            f"Could not find main.py in {DATA_ACQ_DIR}. "
            f"Set DATA_ACQ_DIR env var to the folder containing your "
            f"protocol-driven main.py / session.py."
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pre_existing = {
        p.name
        for p in list(OUTPUT_DIR.glob("session_*.xlsx"))
        + list(OUTPUT_DIR.glob("session_*.csv"))
    }

    creationflags = 0
    preexec_fn = None
    if os.name == "nt":
        # Allow CTRL_BREAK_EVENT to be sent to the child group on Windows
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        preexec_fn = os.setsid  # new process group so we can signal it cleanly

    session_id = time.strftime("session_%Y%m%d_%H%M%S")
    log_path = OUTPUT_DIR / f"{session_id}_tracker.log"

    with open(log_path, "a", buffering=1) as log_file:
        proc = subprocess.Popen(
            [PYTHON_EXE, "main.py"],
            cwd=str(DATA_ACQ_DIR),
            creationflags=creationflags,
            preexec_fn=preexec_fn,
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )

    time.sleep(1.0)
    if proc.poll() is not None:
        error_tail = log_path.read_text(errors="replace")[-2000:].strip()
        raise RuntimeError(
            "Data acquisition tracker exited immediately. "
            f"Log: {log_path}\n{error_tail}"
        )

    _current = RunningSession(
        process=proc,
        started_at=time.time(),
        session_id=session_id,
        log_path=log_path,
        pre_existing_files=pre_existing,
    )
    return _current


def stop(timeout: float = 25.0) -> Path:
    """
    Gracefully stop the running session and return the path of the freshly
    written session_*.xlsx file.
    """
    global _current
    if _current is None:
        raise RuntimeError("No data acquisition session is running.")

    proc = _current.process
    pre_existing = _current.pre_existing_files
    log_path = _current.log_path

    # Send graceful shutdown so Python raises KeyboardInterrupt and the
    # script's `finally:` block runs (which writes the Excel).
    if proc.poll() is None:
        try:
            if os.name == "nt":
                proc.send_signal(signal.CTRL_BREAK_EVENT)  # type: ignore[attr-defined]
            else:
                os.killpg(os.getpgid(proc.pid), signal.SIGINT)
        except Exception:
            proc.terminate()

        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    _current = None

    # Find the new session file the script just wrote (xlsx or csv).
    deadline = time.time() + 5.0
    new_file: Optional[Path] = None
    while time.time() < deadline:
        candidates = [
            p
            for p in list(OUTPUT_DIR.glob("session_*.xlsx"))
            + list(OUTPUT_DIR.glob("session_*.csv"))
            if p.name not in pre_existing
        ]
        if candidates:
            new_file = max(candidates, key=lambda p: p.stat().st_mtime)
            break
        time.sleep(0.3)

    if new_file is None:
        log_tail = _tail_log(log_path)
        raise FileNotFoundError(
            f"Session ended but no new session_*.xlsx/.csv was written in "
            f"{OUTPUT_DIR}. The script may have exited before saving."
            f"\nTracker log:\n{log_tail}"
        )

    return new_file


def status() -> dict:
    if _current is None:
        return {"running": False}
    exit_code = _current.process.poll()
    return {
        "running": is_running(),
        "session_id": _current.session_id,
        "started_at": _current.started_at,
        "elapsed_seconds": time.time() - _current.started_at,
        "pid": _current.process.pid,
        "exit_code": exit_code,
        "log_tail": _tail_log(_current.log_path) if exit_code is not None else "",
    }