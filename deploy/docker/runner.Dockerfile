FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && python3 -m venv /opt/browser-setup \
    && /opt/browser-setup/bin/pip install playwright==1.58.0 \
    && /opt/browser-setup/bin/python -m playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /workspace
