# Duoting Connector（Telegram Session）

用途：把现有 duoting 脚本封装为 Podcast Hub 可执行 connector。

## 目录约定

将你的原始脚本放在 connector 包内：

- scripts/duoting.py

## Telegram session 处理

- 后台 Source 的 secretConfig 中填写 `telegram_session_b64`（session 文件的 base64 字符串）。
- connector 会在运行时还原为临时文件，并通过环境变量 `TELEGRAM_SESSION_FILE` 传给 duoting 脚本。

## 对 duoting.py 的最小要求

- 能在命令行调用：`python scripts/duoting.py`
- 使用环境变量 `TELEGRAM_SESSION_FILE` 读取 session 文件
- 把音频写入环境变量 `PODCAST_HUB_OUTPUT_MEDIA_DIR` 指向目录

## 打包

把 manifest.yaml、src/、scripts/ 打包成 zip 上传后台 Connector。
