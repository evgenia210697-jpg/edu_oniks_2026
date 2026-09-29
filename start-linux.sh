#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --omit=dev
[ -f .env ] || cp .env.example .env
exec node server/index.js
