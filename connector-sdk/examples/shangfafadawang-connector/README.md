# 发发大王 Connector 1.1.0

管理员在后台点击立即同步。有效 Cookie 会直接复用；需要登录时，后台弹出微信二维码，由管理员扫码并在手机确认。脚本核实真实登录后自动获取节目列表并下载，登录会话加密保存到 Source secret，下次运行尽量免扫码。

定时任务发现会话过期时停止并提示需要认证，可点击「扫码登录并继续」。扫码最多等待五分钟。关闭弹窗不会取消脚本。

依赖 requests 和 Playwright Chromium。Linux 需预装 Chromium 系统依赖，Runner 会安装匹配的浏览器版本。见 docs/interactive-qr-login.md。

源码不附带任何 Cookie、登录态或二维码。通过 package.py 生成只含代码的 ZIP；上传、审核后切换现有 Source 的 connectorVersionId 到 1.1.0，保留原来的 Source、节目和 RSS。

学习站点 Cookie 和 H5 ko_token 是两套会话。原有 kotoken.create 刷新、已有节目去重、增量下载流程保持不变。
