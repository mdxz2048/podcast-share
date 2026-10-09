"""Headless WeChat login; only the QR image is sent to the administrator."""
import base64
import json
import os
import time
import uuid
from datetime import datetime, timezone

from requests.cookies import create_cookie


def emit(event):
    print(json.dumps(event, ensure_ascii=False), flush=True)


def authenticated(state):
    return state.get("code") == 0 and bool(state.get("data", {}).get("token_info", {}).get("value"))


def import_browser_cookies(client, cookies):
    for cookie in cookies:
        domain = cookie["domain"].lstrip(".")
        if not any(domain == host or domain.endswith("." + host) for host in ("xiaoe-tech.com", "xiaoeknow.com")):
            continue
        client.session.cookies.set_cookie(create_cookie(
            name=cookie["name"], value=cookie["value"], domain=cookie["domain"],
            path=cookie.get("path", "/"), secure=cookie.get("secure", True),
            expires=int(cookie["expires"]) if cookie.get("expires", -1) > 0 else None,
            rest={"HttpOnly": cookie.get("httpOnly", False)},
        ))


def persist_session(client, context):
    client.save_cookies()
    for key, value in (
        ("xet_cookie_jar", client.cookie_path.read_text(encoding="utf-8")),
        ("xet_browser_state", json.dumps(context.storage_state(), ensure_ascii=False)),
    ):
        emit({"type": "auth_update", "secret_key": key, "value": value,
              "message": "小鹅通登录会话已更新，下次运行优先复用。"})


def login(client, timeout_seconds=60):
    if os.getenv("CONNECTOR_TRIGGER_TYPE") == "scheduled":
        emit({"type": "auth_required", "message": "会话已过期，请在管理员后台手动运行并扫码登录。"})
        raise SystemExit(0)

    from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout
    secrets = json.loads(os.getenv("CONNECTOR_SECRET_JSON", "{}"))
    stored = secrets.get("xet_browser_state")
    state = json.loads(stored) if stored else None
    challenge_id = str(uuid.uuid4())
    deadline = time.monotonic() + timeout_seconds
    expires_at = datetime.fromtimestamp(time.time() + timeout_seconds, timezone.utc).isoformat()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(storage_state=state, user_agent=client.session.headers["User-Agent"])
            if not state:
                context.add_cookies([{
                    "name": c.name, "value": c.value, "domain": c.domain, "path": c.path or "/",
                    "secure": c.secure, "httpOnly": c.has_nonstandard_attr("HttpOnly"),
                    "expires": c.expires if c.expires and c.expires > time.time() else -1,
                    "sameSite": "Lax",
                } for c in client.session.cookies if not c.is_expired()])
            page = context.new_page()
            page.goto("https://study.xiaoe-tech.com/#/wx", wait_until="domcontentloaded", timeout=45000)
            import_browser_cookies(client, context.cookies())
            token_state = client.check_token()
            if authenticated(token_state):
                persist_session(client, context)
                emit({"type": "auth_result", "status": "authenticated", "message": "已复用小鹅通登录会话。"})
                return token_state

            # This is the agreement checkbox on the requested WeChat login page.
            checkbox = page.locator('input[type="checkbox"]')
            checkbox.wait_for(state="attached", timeout=15000)
            if not checkbox.is_checked():
                checkbox.locator("..").click(timeout=15000)
            if not checkbox.is_checked():
                raise RuntimeError("无法勾选小鹅通登录协议，请检查登录页面结构。")
            iframe_selector = 'iframe[src*="open.weixin.qq.com/connect/qrconnect"]'
            iframe = page.locator(iframe_selector).first
            iframe.wait_for(state="visible", timeout=30000)
            page.frame_locator(iframe_selector).locator("img:visible").first.wait_for(state="visible", timeout=30000)
            last_src = None
            last_emit = 0.0
            while time.monotonic() < deadline:
                # A refreshed QR changes its source; publish the replacement image.
                try:
                    if iframe.count() and iframe.is_visible():
                        image = page.frame_locator(iframe_selector).locator("img:visible").first
                        src = image.get_attribute("src", timeout=3000)
                        if src and src != last_src:
                            png = iframe.screenshot(type="png", timeout=5000)
                            emit({"type": "auth_challenge", "challenge_id": challenge_id,
                                  "method": "qr", "expires_at": expires_at,
                                  "message": "请使用微信扫描二维码，并在手机上确认登录。",
                                  "image_data_url": "data:image/png;base64," + base64.b64encode(png).decode("ascii")})
                            last_src = src
                            last_emit = time.monotonic()
                except BrowserTimeout:
                    # The iframe can disappear during the successful login redirect.
                    pass
                import_browser_cookies(client, context.cookies())
                token_state = client.check_token()
                if authenticated(token_state):
                    persist_session(client, context)
                    emit({"type": "auth_result", "challenge_id": challenge_id,
                          "status": "authenticated", "message": "登录成功，正在获取节目列表并下载。"})
                    return token_state
                if time.monotonic() - last_emit >= 15:
                    emit({"type": "log", "message": "等待微信扫码及手机确认登录…"})
                    last_emit = time.monotonic()
                page.wait_for_timeout(2000)
            emit({"type": "auth_result", "challenge_id": challenge_id,
                  "status": "expired", "message": "扫码登录已超时，请重新启动任务。"})
            raise RuntimeError("微信扫码登录超时，请重新启动任务。")
        except Exception:
            emit({"type": "auth_result", "challenge_id": challenge_id,
                  "status": "failed", "message": "扫码登录未完成，请查看运行日志后重试。"})
            raise
        finally:
            browser.close()
