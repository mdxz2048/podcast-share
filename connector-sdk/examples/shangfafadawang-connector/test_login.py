import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent / "scripts"))
from xet import XetClient
import wx_login

EXPIRED = {"code": 0, "data": {"token_info": {"value": ""}}}
VALID = {"code": 0, "data": {"token_info": {"value": "verified-session"}}}


class LoginTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.client = XetClient(Path(self.directory.name))

    def test_valid_cookie_skips_browser(self):
        self.client.check_token = MagicMock(return_value=VALID)
        with patch.object(wx_login, "login") as login:
            self.assertEqual(self.client.ensure_logged_in(), VALID)
            login.assert_not_called()

    def test_expired_cookie_starts_qr_login_after_refresh(self):
        self.client.check_token = MagicMock(return_value=EXPIRED)
        self.client.refresh_cookies_from_server = MagicMock(return_value=[])
        with patch.object(wx_login, "login", return_value=VALID) as login:
            self.assertEqual(self.client.ensure_logged_in(), VALID)
            login.assert_called_once_with(self.client)

    def test_scheduled_expiry_requests_manual_login_without_browser(self):
        with patch.dict(os.environ, {"CONNECTOR_TRIGGER_TYPE": "scheduled"}), patch.object(wx_login, "emit") as emit:
            with self.assertRaises(SystemExit) as result:
                wx_login.login(self.client)
            self.assertEqual(result.exception.code, 0)
            self.assertEqual(emit.call_args.args[0]["type"], "auth_required")

    def test_scan_is_verified_before_session_is_saved(self):
        self.client.check_token = MagicMock(side_effect=[EXPIRED, VALID])
        browser = MagicMock()
        context = browser.new_context.return_value
        context.cookies.return_value = [{"name": "auth", "value": "private-cookie", "domain": "study.xiaoe-tech.com", "path": "/", "expires": -1}]
        context.storage_state.return_value = {"cookies": [], "origins": []}
        page = context.new_page.return_value
        page.locator.return_value.is_checked.return_value = True
        iframe = page.locator.return_value.first
        iframe.screenshot.return_value = b"fake-png-for-protocol-test"
        page.frame_locator.return_value.locator.return_value.first.get_attribute.return_value = "/connect/qrcode/new"
        events = []
        with patch.dict(os.environ, {"CONNECTOR_TRIGGER_TYPE": "manual", "CONNECTOR_SECRET_JSON": "{}"}), \
             patch("playwright.sync_api.sync_playwright") as playwright, patch.object(wx_login, "emit", side_effect=events.append):
            playwright.return_value.__enter__.return_value.chromium.launch.return_value = browser
            self.assertEqual(wx_login.login(self.client), VALID)
        types = [event["type"] for event in events]
        self.assertEqual(types, ["auth_challenge", "auth_update", "auth_update", "auth_result"])
        self.assertEqual(events[-1]["status"], "authenticated")
        self.assertEqual(events[0]["challenge_id"], events[-1]["challenge_id"])
        self.assertIn("private-cookie", self.client.cookie_path.read_text())
        self.assertNotIn("private-cookie", json.dumps(events[0]))
        browser.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
