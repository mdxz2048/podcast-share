#!/usr/bin/env python3
from __future__ import annotations

"""
纯 API 版 xet.py — 发发大王专用。
优先复用 Cookie，只做 latest 模式下载。
登录失效时通过无界面浏览器生成微信二维码，在管理员后台扫码。
"""
import argparse
import csv
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from typing import Iterable
from urllib.parse import quote, urlparse

import requests
from requests.exceptions import JSONDecodeError as RequestsJSONDecodeError
from requests.cookies import create_cookie

STUDY_ORIGIN = "https://study.xiaoe-tech.com"
DEFAULT_PROFILE_DIR = Path(".xet-profile")
DEFAULT_DOWNLOAD_DIR = Path("audio")
DEFAULT_MANIFEST_OUTPUT = DEFAULT_DOWNLOAD_DIR / "episodes.json"
DEFAULT_PAGE_SIZE = 16
DEFAULT_TIMEOUT = 30


@dataclass
class Episode:
    resource_id: str
    app_id: str
    user_id: str
    title: str
    page_url: str
    pub_date: str = ""
    author: str = ""
    image_url: str = ""
    description: str = ""
    audio_url: str = ""
    file_name: str = ""
    file_size: int = 0
    mime_type: str = "audio/mpeg"
    duration_seconds: int = 0


class XetClient:
    def __init__(self, profile_dir: Path, timeout: int = DEFAULT_TIMEOUT):
        self.profile_dir = Path(profile_dir)
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        self.cookie_path = self.profile_dir / "cookies.txt"
        self.timeout = timeout
        self.synced_apps: set[str] = set()
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://study.xiaoe-tech.com/t_l/learnIndex",
        })
        self.session.cookies = MozillaCookieJar(str(self.cookie_path))
        if self.cookie_path.exists():
            self.session.cookies.load(ignore_discard=True, ignore_expires=True)

    def save_cookies(self) -> None:
        self.session.cookies.save(ignore_discard=True, ignore_expires=True)

    def post_json(self, url: str, payload: dict | None = None) -> dict:
        resp = self.session.post(url, json=payload or {}, timeout=self.timeout)
        resp.raise_for_status()
        try:
            return resp.json()
        except RequestsJSONDecodeError:
            body = resp.text.strip()
            raise RuntimeError(f"Expected JSON from {url}, got: {body[:200]}")

    def post_form(self, url: str, payload: dict[str, str]) -> dict:
        resp = self.session.post(
            url, data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        try:
            return resp.json()
        except RequestsJSONDecodeError:
            body = resp.text.strip()
            raise RuntimeError(f"Expected JSON from {url}, got: {body[:200]}")

    # === 登录 & 续期 ===

    def check_token(self) -> dict:
        return self.post_json(f"{STUDY_ORIGIN}/xe.learn-pc.user/check_token")

    def _h5_cookie_status(self, app_id: str) -> str:
        now = time.time()
        matched = []
        for cookie in self.session.cookies:
            domain = (cookie.domain or "").lstrip(".").lower()
            if domain != f"{app_id.lower()}.h5.xiaoeknow.com":
                continue
            if cookie.name != "ko_token":
                continue
            if cookie.expires:
                expires_at = datetime.fromtimestamp(cookie.expires, timezone.utc).astimezone().isoformat()
                state = "expired" if cookie.expires <= now else "expires"
                matched.append(f"ko_token {state} at {expires_at}")
            else:
                matched.append("ko_token is a session cookie")
        return "; ".join(matched) if matched else "ko_token not found"

    def _has_valid_h5_session(self, app_id: str) -> bool:
        token = self.get_h5_token(app_id)
        return bool(token and token != "good_token")

    def refresh_cookies_from_server(self) -> list[str]:
        """Warm the study session. H5 cookies are refreshed after candidates provide app/user ids."""
        logs: list[str] = []
        try:
            self.session.get(f"{STUDY_ORIGIN}/t_l/learnIndex", timeout=self.timeout)
            logs.append("warmed study session")
        except Exception as error:
            logs.append(f"warm study failed: {error}")
        self.save_cookies()
        return logs

    def ensure_logged_in(self) -> dict:
        """确保已登录 — 只靠 cookie，不弹任何 UI"""
        token_state = self.check_token()
        if token_state.get("code") == 0 and token_state.get("data", {}).get("token_info", {}).get("value"):
            return token_state

        refresh_logs = self.refresh_cookies_from_server()
        token_state = self.check_token()
        if token_state.get("code") == 0 and token_state.get("data", {}).get("token_info", {}).get("value"):
            return token_state

        from wx_login import login
        return login(self)

    # === H5 auth ===

    def get_h5_origin(self, app_id: str) -> str:
        return f"https://{app_id}.h5.xiaoeknow.com"

    def get_h5_token(self, app_id: str) -> str:
        payload = self.post_json(f"{self.get_h5_origin(app_id)}/account/check-auth-new", {})
        data = payload.get("data")
        if isinstance(data, dict):
            return str(data.get("token") or "")
        return ""

    def create_h5_ko_token(self, app_id: str, user_id: str) -> tuple[bool, str]:
        if not app_id or not user_id:
            return False, "missing app_id or user_id"
        app_id_normalized = app_id.lower()
        data = self.post_json(
            f"{STUDY_ORIGIN}/xe.learn-pc.client.user/kotoken.create/1.0.0?app_id={app_id}",
            {"app_id": app_id, "user_id": user_id},
        )
        if data.get("code") != 0:
            return False, str(data.get("msg") or "unknown error")
        token_info = data.get("data", {}).get("token", {})
        token_value = token_info.get("value") if isinstance(token_info, dict) else ""
        if not token_value:
            return False, "kotoken.create returned empty token"
        expires_in = int(token_info.get("cookie_expires") or token_info.get("expires") or 0)
        expires = int(time.time() + expires_in) if expires_in > 0 else None
        self.session.cookies.set_cookie(
            create_cookie(
                name="ko_token",
                value=str(token_value),
                domain=f".{app_id_normalized}.h5.xiaoeknow.com",
                path="/",
                secure=True,
                expires=expires,
            )
        )
        if self._has_valid_h5_session(app_id):
            self.synced_apps.add(app_id)
            self.save_cookies()
            return True, "created H5 ko_token from study session"
        return False, "created ko_token but H5 validation failed"

    def ensure_h5_login(self, app_id: str, user_id: str = "") -> None:
        if app_id in self.synced_apps:
            return
        cookie_status = self._h5_cookie_status(app_id)
        if self._has_valid_h5_session(app_id):
            self.synced_apps.add(app_id)
            self.save_cookies()
            return
        ok, create_msg = self.create_h5_ko_token(app_id, user_id)
        if ok:
            print(f"H5 ko_token refreshed: {app_id}")
            return
        raise RuntimeError(
            f"H5 侧 cookie 不可用 app_id={app_id}: auto ko_token failed: {create_msg}; {cookie_status}。"
            "请检查 study p_token 是否仍可用，或小鹅通 kotoken.create 接口是否变更。"
        )

    # === 课程拉取 ===

    def fetch_episode_page(self, page: int, page_size: int) -> dict:
        return self.post_json(
            f"{STUDY_ORIGIN}/xe.learn-pc/my_attend_normal_list.get/1.0.1",
            {"page_size": page_size, "page": page, "agent_type": 7, "resource_type": ["0"]},
        )

    def fetch_all_audio_episodes(self, page_size: int = DEFAULT_PAGE_SIZE) -> list[Episode]:
        episodes: list[Episode] = []
        page = 1
        while True:
            data = self.fetch_episode_page(page, page_size)
            items = data.get("data", {}).get("list", [])
            for item in items:
                if item.get("resource_type") != 2:
                    continue
                h5_url = item.get("h5_url") or ""
                if "/audio/" not in h5_url:
                    continue
                episodes.append(
                    Episode(
                        resource_id=item.get("resource_id") or item.get("resources_id") or "",
                        app_id=item.get("app_id") or self._extract_app_id(h5_url),
                        user_id=item.get("user_id") or "",
                        title=item.get("title") or "",
                        page_url=self._normalize_page_url(h5_url),
                        pub_date=(item.get("last_learn_at") or "")[:10],
                        author=item.get("shop_name") or "",
                        image_url=item.get("img_url") or item.get("img_url_compressed") or "",
                    )
                )
            if len(items) < page_size:
                break
            page += 1
        return episodes

    def fetch_audio_info(self, episode: Episode) -> Episode:
        self.ensure_h5_login(episode.app_id, episode.user_id)
        base = f"https://{episode.app_id}.h5.xiaoeknow.com"
        data = self.post_form(
            f"{base}/xe.course.business.audio.info.get/2.0.0",
            {"bizData[resource_id]": episode.resource_id, "bizData[opr_sys]": "Darwin"},
        )
        info = data.get("data", {}).get("audio_info", {})
        episode.title = info.get("title") or episode.title
        episode.audio_url = info.get("audio_url") or ""
        episode.pub_date = (info.get("start_at") or episode.pub_date or "")[:10]
        episode.description = (
            info.get("description")
            or info.get("intro")
            or info.get("summary")
            or info.get("content")
            or info.get("resource_intro")
            or episode.description
            or ""
        )
        episode.duration_seconds = parse_duration_seconds(
            info.get("duration")
            or info.get("duration_seconds")
            or info.get("audio_duration")
            or info.get("audio_length")
            or info.get("play_time")
            or info.get("time_length")
        )
        return episode

    def download_episode(self, episode: Episode, download_dir: Path) -> Episode:
        if not episode.audio_url:
            raise RuntimeError(f"Missing audio URL for {episode.title}")
        download_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(urlparse(episode.audio_url).path).suffix or ".mp3"
        file_name = _safe_file_name(episode.title, suffix)
        output_path = download_dir / file_name
        with self.session.get(episode.audio_url, stream=True, timeout=self.timeout) as resp:
            resp.raise_for_status()
            with output_path.open("wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
            episode.mime_type = resp.headers.get("content-type", "audio/mpeg")
        episode.file_name = file_name
        episode.file_size = output_path.stat().st_size
        return episode

    @staticmethod
    def _extract_app_id(h5_url: str) -> str:
        try:
            return urlparse(h5_url).hostname.split(".")[0]
        except Exception:
            return ""

    @staticmethod
    def _normalize_page_url(h5_url: str) -> str:
        return h5_url.replace("/v1/course/audio/", "/p/course/audio/")


# === 工具函数 ===

def _safe_file_name(title: str, suffix: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', '_', title).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return f"{cleaned or 'episode'}{suffix}"


def parse_duration_seconds(value) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text = str(value).strip()
    if not text:
        return 0
    if text.isdigit():
        return int(text)
    parts = text.split(":")
    if all(part.isdigit() for part in parts):
        total = 0
        for part in parts:
            total = total * 60 + int(part)
        return total
    return 0


def write_csv(episodes: Iterable[Episode], csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f, fieldnames=["id", "title", "pubDate", "durationSeconds", "pageUrl", "author", "description", "imageUrl", "url"],
        )
        writer.writeheader()
        for ep in episodes:
            writer.writerow({
                "id": ep.resource_id, "title": ep.title, "pubDate": ep.pub_date, "durationSeconds": ep.duration_seconds,
                "pageUrl": ep.page_url, "author": ep.author, "description": ep.description,
                "imageUrl": ep.image_url, "url": ep.audio_url,
            })


def load_manifest(manifest_path: Path) -> list[dict]:
    if not manifest_path.exists():
        return []
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def merge_manifest(downloaded: Iterable[Episode], manifest_path: Path) -> None:
    existing = load_manifest(manifest_path)
    by_id = {str(i.get("id") or ""): i for i in existing if i.get("id")}
    ordered_ids = [str(i.get("id") or "") for i in existing if i.get("id")]
    for ep in downloaded:
        now_str = datetime.now(timezone.utc).isoformat()
        item = {
            "id": ep.resource_id, "title": ep.title, "pubDate": ep.pub_date,
            "updated": now_str, "pageUrl": ep.page_url, "description": ep.description,
            "author": ep.author, "imageUrl": ep.image_url, "originalUrl": ep.audio_url,
            "fileName": ep.file_name, "fileSize": ep.file_size, "mimeType": ep.mime_type,
            "durationSeconds": ep.duration_seconds,
        }
        if ep.resource_id not in by_id:
            ordered_ids.insert(0, ep.resource_id)
        by_id[ep.resource_id] = item
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    merged = [by_id[i] for i in ordered_ids if i in by_id]
    manifest_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")


def manifest_ids(manifest_path: Path) -> set[str]:
    return {str(i.get("id")) for i in load_manifest(manifest_path) if i.get("id")}


def refresh_h5_sessions_from_candidates(client: XetClient, candidates: Iterable[Episode]) -> None:
    seen: set[tuple[str, str]] = set()
    for ep in candidates:
        key = (ep.app_id, ep.user_id)
        if not ep.app_id or key in seen:
            continue
        seen.add(key)
        try:
            client.ensure_h5_login(ep.app_id, ep.user_id)
            print(f"H5 auth ready: {ep.app_id}")
        except Exception as error:
            print(f"H5 auth refresh warning: {ep.app_id}: {error}")


# === latest 模式 (connector 调用的) ===

def run_latest(args: argparse.Namespace) -> None:
    client = XetClient(profile_dir=args.profile_dir, timeout=args.timeout)

    refresh_logs = client.refresh_cookies_from_server()
    if refresh_logs:
        print("Cookie refresh:")
        for line in refresh_logs:
            print(f"- {line}")

    auth_state = client.ensure_logged_in()
    nickname = (
        auth_state.get("data", {}).get("data", {}).get("nickname")
        or auth_state.get("data", {}).get("data", {}).get("b_user_id")
    )
    if nickname:
        print(f"Logged in as: {nickname}")

    existing_ids = manifest_ids(args.manifest_output)
    candidates = client.fetch_all_audio_episodes(page_size=args.page_size)
    print(f"Fetched {len(candidates)} audio candidate(s).")
    if args.max_scan > 0:
        candidates = candidates[: args.max_scan]
    if args.limit > 0:
        candidates = candidates[: args.limit]
    refresh_h5_sessions_from_candidates(client, candidates)

    selected = [ep for ep in candidates if ep.resource_id not in existing_ids]
    print(f"Selected {len(selected)} new episode(s), skipped {len(candidates) - len(selected)} existing episode(s).")

    if not selected:
        print("No new episodes found.")
        return

    downloaded = []
    for ep in selected:
        resolved = client.fetch_audio_info(ep)
        print(f"Downloading: {resolved.title}")
        downloaded.append(client.download_episode(resolved, args.download_dir))

    write_csv(downloaded, args.csv_output)
    merge_manifest(downloaded, args.manifest_output)
    print(f"\nDownloaded {len(downloaded)} new episode(s) to {args.download_dir.resolve()}")
    print(f"Updated manifest at {args.manifest_output.resolve()}")


# === CLI ===

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Xiaoetong audio downloader (API-only).")
    sub = parser.add_subparsers(dest="command")
    latest = sub.add_parser("latest", help="Download newest episodes (no UI needed).")
    latest.add_argument("--profile-dir", type=Path, default=DEFAULT_PROFILE_DIR)
    latest.add_argument("--download-dir", type=Path, default=DEFAULT_DOWNLOAD_DIR)
    latest.add_argument("--csv-output", type=Path, default=Path("episodes.selected.csv"))
    latest.add_argument("--manifest-output", type=Path, default=DEFAULT_MANIFEST_OUTPUT)
    latest.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    latest.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    latest.add_argument("--limit", type=int, default=0)
    latest.add_argument("--max-scan", type=int, default=0)
    return parser


def main() -> int:
    parser = build_parser()
    argv = sys.argv[1:]
    if not argv:
        argv = ["latest"]
    args = parser.parse_args(argv if argv[:1] == ["latest"] else ["latest"] + argv)
    if args.command == "latest":
        run_latest(args)
        return 0
    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        raise SystemExit(130)
