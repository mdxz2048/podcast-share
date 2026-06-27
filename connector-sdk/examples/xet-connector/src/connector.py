import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def emit(event):
    print(json.dumps(event, ensure_ascii=False), flush=True)


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def parse_json_env(name, default):
    raw = os.getenv(name, "")
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def scan_media_files(media_root: Path):
    exts = {".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac"}
    files = []
    for file in media_root.rglob("*"):
        if file.is_file() and file.suffix.lower() in exts:
            files.append(file)
    files.sort()
    return files


def file_checksum(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def content_type(path: Path):
    mapping = {
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
    }
    return mapping.get(path.suffix.lower(), "audio/mpeg")


if __name__ == "__main__":
    input_json = parse_json_env("CONNECTOR_INPUT_JSON", {})
    output_root = Path(os.getenv("CONNECTOR_OUTPUT_ROOT", "/work/output"))
    media_root = output_root / "media"
    media_root.mkdir(parents=True, exist_ok=True)

    source_name = str(input_json.get("source_name", "xet-source"))
    program_title = str(input_json.get("program_title", "XET 节目"))
    script_path = str(input_json.get("script_path", "scripts/xet.py"))
    qr_confirmed = bool(input_json.get("qr_confirmed", False))

    if not qr_confirmed:
        emit(
            {
                "type": "auth_required",
                "kind": "qr_interactive",
                "label": "请在外部终端完成 xet.py 两次扫码登录后，提交 qr_confirmed=true 再继续",
            }
        )
        emit({"type": "log", "level": "info", "message": "waiting for manual qr confirmation"})
        raise SystemExit(0)

    connector_root = Path.cwd()
    script_abs = connector_root / script_path
    if not script_abs.exists():
        emit({"type": "log", "level": "error", "message": f"script not found: {script_path}"})
        raise SystemExit(2)

    cmd = [sys.executable, str(script_abs)]
    env = os.environ.copy()
    env["PODCAST_HUB_OUTPUT_MEDIA_DIR"] = str(media_root)

    result = subprocess.run(cmd, cwd=str(connector_root), env=env, capture_output=True, text=True)
    if result.stdout.strip():
        emit({"type": "log", "level": "info", "message": result.stdout.strip()[:2000]})
    if result.stderr.strip():
        emit({"type": "log", "level": "warn", "message": result.stderr.strip()[:2000]})

    if result.returncode != 0:
        emit({"type": "log", "level": "error", "message": f"script exited with code {result.returncode}"})
        raise SystemExit(result.returncode)

    external_program_id = f"xet:{source_name}"
    emit(
        {
            "type": "program",
            "external_program_id": external_program_id,
            "title": program_title,
            "description": f"Imported from xet.py source={source_name}",
        }
    )

    files = scan_media_files(media_root)
    for file in files:
        rel = file.relative_to(media_root).as_posix()
        eid = f"xet:{source_name}:{hashlib.md5(rel.encode('utf-8')).hexdigest()}"
        emit(
            {
                "type": "episode",
                "external_episode_id": eid,
                "program_external_id": external_program_id,
                "title": file.stem,
                "description": "Imported by xet connector",
                "published_at": iso_now(),
            }
        )
        emit(
            {
                "type": "media_ready",
                "external_episode_id": eid,
                "file": f"media/{rel}",
                "content_type": content_type(file),
                "size": file.stat().st_size,
                "checksum": file_checksum(file),
            }
        )
