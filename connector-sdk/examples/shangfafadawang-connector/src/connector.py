import hashlib
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


def emit(event):
    print(json.dumps(event, ensure_ascii=False), flush=True)


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def parse_xet_time(value):
    if not value:
        return iso_now()
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except ValueError:
        return iso_now()


def parse_duration_seconds(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    parts = text.split(":")
    if all(part.isdigit() for part in parts):
        total = 0
        for part in parts:
            total = total * 60 + int(part)
        return total
    return None


def clean_text(value):
    text = str(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


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


def image_content_type(path: Path):
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if path.suffix.lower() == ".png":
        return "image/png"
    return "application/octet-stream"


def image_data_url(path: Path):
    return f"data:{image_content_type(path)};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def renew_before_run(cookie_path: Path):
    if not cookie_path.exists():
        return "cookie file not found; xet.py will handle auth/refresh"
    return "cookie refresh delegated to xet.py"


def seed_cookie_profile(profile_dir: Path, profile_src: Path, secret_json: dict):
    if profile_dir.exists():
        shutil.rmtree(profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)
    if profile_src.exists():
        shutil.copytree(profile_src, profile_dir, dirs_exist_ok=True)

    cookie_path = profile_dir / "cookies.txt"
    secret_cookie_jar = str(secret_json.get("xet_cookie_jar") or secret_json.get("xet_auth_store", "")).strip()
    if secret_cookie_jar:
        cookie_path.write_text(secret_cookie_jar, encoding="utf-8")
        return cookie_path, "loaded xet cookies from Source secret"

    auth_blob = profile_dir / "xet_auth_store.txt"
    if auth_blob.exists():
        auth_blob.rename(cookie_path)
        return cookie_path, "loaded bundled xet cookies"
    return cookie_path, "no bundled xet cookies found"


def emit_cookie_update(cookie_path: Path):
    if not cookie_path.exists() or cookie_path.stat().st_size <= 0:
        return
    emit(
        {
            "type": "auth_update",
            "secret_key": "xet_cookie_jar",
            "value": cookie_path.read_text(encoding="utf-8"),
            "message": "updated xet cookie jar",
        }
    )


def seed_existing_manifest(path: Path, source_name: str, external_ids):
    if not isinstance(external_ids, list):
        return 0

    prefix = f"shangfafadawang:{source_name}:"
    rows = []
    seen = set()
    for raw in external_ids:
        if not isinstance(raw, str) or not raw:
            continue
        resource_id = raw[len(prefix):] if raw.startswith(prefix) else raw
        if not resource_id or resource_id in seen:
            continue
        seen.add(resource_id)
        rows.append({"id": resource_id})

    if not rows:
        return 0

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(rows)


if __name__ == "__main__":
    input_json = parse_json_env("CONNECTOR_INPUT_JSON", {})
    secret_json = parse_json_env("CONNECTOR_SECRET_JSON", {})
    output_root = Path(os.getenv("CONNECTOR_OUTPUT_ROOT", "/work/output"))
    media_root = output_root / "media"
    media_root.mkdir(parents=True, exist_ok=True)

    source_name = str(input_json.get("source_name", "shangfafadawang"))
    program_title = str(input_json.get("program_title", "发发大王"))
    program_description = str(input_json.get("program_description", "发发大王音频节目。"))
    limit = int(input_json.get("limit", 0) or 0)
    max_scan = int(input_json.get("max_scan", 0) or 0)

    connector_root = Path.cwd()
    script_abs = connector_root / "scripts/xet.py"
    profile_src = connector_root / "runtime_data/profile"
    profile_dir = output_root / "xet-profile"
    cookie_path, cookie_seed_message = seed_cookie_profile(profile_dir, profile_src, secret_json)
    emit({"type": "log", "level": "info", "message": cookie_seed_message})
    emit({"type": "log", "level": "info", "message": renew_before_run(cookie_path)})

    csv_path = output_root / "episodes.selected.csv"
    manifest_path = output_root / "episodes.json"
    seeded_count = seed_existing_manifest(manifest_path, source_name, input_json.get("existing_external_episode_ids"))
    emit({"type": "log", "level": "info", "message": f"seeded existing episode ids: {seeded_count}"})

    cmd = [
        sys.executable,
        "-u",
        str(script_abs),
        "latest",
        "--profile-dir",
        str(profile_dir),
        "--download-dir",
        str(media_root),
        "--csv-output",
        str(csv_path),
        "--manifest-output",
        str(manifest_path),
    ]
    cmd += ["--limit", str(limit)]
    cmd += ["--max-scan", str(max_scan)]

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    emit({"type": "log", "level": "info", "message": "starting shangfafadawang xet.py in streaming mode"})
    emit({"type": "log", "level": "info", "message": f"download dir: {media_root}"})
    if cmd[0].endswith("python") or cmd[0].endswith("python3"):
        cmd.insert(1, "-u")

    process = subprocess.Popen(
        cmd,
        cwd=str(connector_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    auth_required_seen = threading.Event()

    def stream_pipe(pipe, level):
        if pipe is None:
            return
        for line in iter(pipe.readline, ""):
            stripped = line.rstrip("\n")
            if not stripped:
                continue
            if level == "info":
                try:
                    event = json.loads(stripped)
                    if isinstance(event, dict) and event.get("type") in {
                        "auth_challenge", "auth_result", "auth_required", "auth_update"
                    }:
                        if event.get("type") == "auth_required":
                            auth_required_seen.set()
                        emit(event)
                        continue
                except json.JSONDecodeError:
                    pass
            emit({"type": "log", "level": level, "message": stripped[:4000]})

    stdout_thread = threading.Thread(target=stream_pipe, args=(process.stdout, "info"), daemon=True)
    stderr_thread = threading.Thread(target=stream_pipe, args=(process.stderr, "warn"), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    process.wait()

    stdout_thread.join(timeout=1)
    stderr_thread.join(timeout=1)

    if process.stdout:
        process.stdout.close()
    if process.stderr:
        process.stderr.close()

    if process.returncode != 0:
        emit({"type": "log", "level": "error", "message": f"xet.py exit code={process.returncode}"})
        raise SystemExit(process.returncode)

    if auth_required_seen.is_set():
        raise SystemExit(0)

    emit_cookie_update(cookie_path)

    # 读 xet.py 产生的 manifest，用来输出 episode description
    episodes_meta: dict[str, dict] = {}
    manifest_path = output_root / "episodes.json"
    try:
        if manifest_path.exists():
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
            for item in raw:
                eid = item.get("id", "")
                episodes_meta[eid] = item
    except Exception:
        pass

    external_program_id = f"shangfafadawang:{source_name}"
    emit(
        {
            "type": "program",
            "external_program_id": external_program_id,
            "title": program_title,
            "description": program_description,
        }
    )

    emitted_count = 0
    for file in scan_media_files(media_root):
        stem = file.stem
        title = stem
        description = ""
        published_at = iso_now()
        duration_seconds = None
        resource_id = ""

        for eid, meta in episodes_meta.items():
            if meta.get("fileName", "").startswith(stem) or stem in meta.get("fileName", ""):
                resource_id = str(meta.get("id") or "")
                title = meta.get("title", stem)
                meta_description = clean_text(meta.get("description", ""))
                published_at = parse_xet_time(meta.get("pubDate") or meta.get("updated"))
                duration_seconds = parse_duration_seconds(meta.get("durationSeconds"))
                if meta.get("pageUrl"):
                    description = f"{meta_description}\n\n发布: {meta.get('pubDate', '')}\n链接: {meta['pageUrl']}".strip()
                elif meta.get("pubDate"):
                    description = f"{meta_description}\n\n发布: {meta['pubDate']}".strip()
                else:
                    description = meta_description
                break

        rel = file.relative_to(media_root).as_posix()
        stable_episode_key = resource_id or hashlib.md5(rel.encode("utf-8")).hexdigest()
        eid = f"shangfafadawang:{source_name}:{stable_episode_key}"
        episode_event = {
            "type": "episode",
            "external_episode_id": eid,
            "program_external_id": external_program_id,
            "title": title,
            "description": description or "发发大王 podcast episode",
            "published_at": published_at,
        }
        media_event = {
            "type": "media_ready",
            "external_episode_id": eid,
            "file": f"media/{rel}",
            "content_type": content_type(file),
            "size": file.stat().st_size,
            "checksum": file_checksum(file),
        }
        if duration_seconds is not None:
            episode_event["duration_seconds"] = duration_seconds
            media_event["duration_seconds"] = duration_seconds
        emit(episode_event)
        emit(media_event)
        emitted_count += 1
    emit({"type": "log", "level": "info", "message": f"emitted podcast episodes: {emitted_count}"})
