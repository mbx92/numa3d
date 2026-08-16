#!/bin/sh
set -e
echo "[numa3d] Menjalankan migrasi…"
node scripts/migrate.js
echo "[numa3d] Menjalankan server…"
exec node .output/server/index.mjs
