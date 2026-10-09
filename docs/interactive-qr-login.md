# Connector 扫码登录

管理员点击 Source「立即运行」后，API 返回 Job ID，Runner 在同一次任务中保留无界面浏览器并等待扫码。管理员只看到二维码弹窗，不需要打开第三方网页。扫码成功后 connector 必须验证服务端会话，随后发送登录结果并继续导入。

## 通用 JSONL 事件

```json
{"type":"auth_challenge","challenge_id":"unique-id","method":"qr","message":"请使用微信扫码并在手机确认","image_data_url":"data:image/png;base64,...","expires_at":"2030-01-01T00:05:00+00:00"}
{"type":"auth_update","secret_key":"session_key_declared_in_manifest","value":"serialized-session","message":"登录会话已更新"}
{"type":"auth_result","challenge_id":"unique-id","status":"authenticated","message":"登录成功，继续导入"}
```

- 图片支持 PNG/JPEG/WebP，data URL 最大 512,000 字符；不接受远程地址或 SVG。刷新二维码时重新发送同一个 challenge ID 和新图片/过期时间。不同认证阶段应使用不同 ID。
- `auth_result.status` 支持 `authenticated`、`expired`、`failed`。只有验证真实登录后才能发送 `authenticated`。不使用 `qr_confirmed=true` 代替身份验证。
- 这些事件必须直接写到标准输出，一行一个 JSON，立即 flush；包装脚本必须透传，不能截断成普通日志。
- Runner 按顺序实时回调；API 仅接受内部 token 认证、活跃任务的回调。图片只通过管理员认证的任务 API 返回。会话按 Source 绑定，加密保存，任务日志中的值会被遮盖。
- 认证过程仍处于 `running`，不能启动第二个任务。关闭弹窗不会取消任务，可点击「显示登录二维码」重新打开。
- `CONNECTOR_TRIGGER_TYPE` 为 `manual`、`resume` 或 `scheduled`。定时运行发现会话过期时发出 `auth_required` 并退出 0，不等待无人扫码。Source 会标为认证过期，管理员点击「扫码登录并继续」恢复同一任务。
- 最终导入阶段跳过已成功实时处理的认证事件，避免重复保存会话及重新弹出旧二维码。回调失败时保留最终事件作为兼容处理。

## 发发大王 1.1.1

源码在 `connector-sdk/examples/shangfafadawang-connector/`。先检查并续期已有 Cookie；仍无效时使用 Playwright 在服务器后台打开 `https://study.xiaoe-tech.com/#/wx`，勾选登录协议并截图微信 iframe 的二维码。每两秒检查真实 Cookie 登录状态，等待上限五分钟；成功后保存 `xet_cookie_jar` 和 `xet_browser_state`，继续原有节目列表、H5 token 刷新和增量下载流程。兼容旧版 `xet_auth_store`。

打包命令：

```powershell
python connector-sdk/examples/shangfafadawang-connector/package.py
```

包内只有代码、manifest、说明和依赖，不包含任何 Cookie、浏览器状态或 runtime_data。上传版本 1.1.1、审核启用后，将现有发发大王 Source 的 connectorVersionId 切换到新版本，保留节目/RSS 和 Source secret。

## 部署

同时部署 API、Runner 和 Web 的修改。数据库不需要新增表或迁移。浏览器会使用 runner 用户的 Playwright 缓存，Runner 会自动安装匹配版本的 Chromium，缓存目录须可写。

Linux 的 Chromium 系统依赖需由管理员预装：

```sh
python3 -m venv /opt/podcast-browser-setup
/opt/podcast-browser-setup/bin/pip install playwright==1.58.0
/opt/podcast-browser-setup/bin/python -m playwright install-deps chromium
```

Compose 的 Runner 使用 Debian 镜像，提供 Python venv 和 Chromium 的系统依赖。systemd 部署可使用上面的依赖安装命令，实际浏览器由 runner 服务用户安装和缓存。不要把 session secret 或二维码写入公共目录、Git 或 connector ZIP。

实现参考：[Playwright 会话复用](https://playwright.dev/python/docs/auth)、[浏览器及系统依赖安装](https://playwright.dev/python/docs/browsers)。
