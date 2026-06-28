# XET Connector（手动扫码）

用途：把现有 xet.py 封装为 Podcast Hub 可执行 connector。

## 目录约定

将你的原始脚本放在 connector 包内：

- scripts/xet.py

## 运行行为

- 每次运行都会直接执行 `scripts/xet.py`。
- `xet.py` 的标准输出和错误输出会实时转发为日志事件，便于在后台终端弹窗中看到二维码与进度信息。
- 脚本执行后，connector 会扫描 `CONNECTOR_OUTPUT_ROOT/media` 下的音频文件并转换为网站支持的 JSONL 事件。

## 对 xet.py 的最小要求

- 能在非交互命令行被调用：`python scripts/xet.py`
- 把音频文件保存到环境变量 `PODCAST_HUB_OUTPUT_MEDIA_DIR` 指向目录

## 打包

把 manifest.yaml、src/、scripts/ 打包成 zip 上传后台 Connector。
