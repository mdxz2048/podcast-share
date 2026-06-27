#!/usr/bin/env sh
set -eu
pnpm --filter @podcast-hub/api db:seed
