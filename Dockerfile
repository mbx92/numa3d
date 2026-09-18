FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS app-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
RUN apk add --no-cache wget
COPY --from=app-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/server/db/migrations ./server/db/migrations
COPY --from=builder /app/scripts/migrate.js ./scripts/migrate.js
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh && chmod +x scripts/docker-entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["scripts/docker-entrypoint.sh"]

# Orca menyediakan AppImage Ubuntu 24.04. Ekstrak saat build supaya runtime
# tidak memerlukan FUSE atau akses device khusus dari Docker.
FROM ubuntu:24.04 AS orca
ARG ORCA_VERSION=2.4.2
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
  case "$TARGETARCH" in \
    amd64) asset="OrcaSlicer_Linux_AppImage_Ubuntu2404_V${ORCA_VERSION}.AppImage"; checksum="d12fb8c8eac1aecd2dfb6377acd48f994f8fa439ed5292fa532dd82880f029fd" ;; \
    arm64) asset="OrcaSlicer_Linux_AppImage_Ubuntu2404_aarch64_V${ORCA_VERSION}.AppImage"; checksum="e1a07275a25f176626c55a5df39e91bc4476d8c28ee4a3192ff758e29dd5c3ba" ;; \
    *) echo "Arsitektur tidak didukung: $TARGETARCH" >&2; exit 1 ;; \
  esac; \
  curl -fL --retry 3 -o /tmp/orca.AppImage "https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v${ORCA_VERSION}/${asset}"; \
  echo "${checksum}  /tmp/orca.AppImage" | sha256sum -c -; \
  chmod +x /tmp/orca.AppImage; \
  cd /opt; /tmp/orca.AppImage --appimage-extract >/dev/null; \
  mv /opt/squashfs-root /opt/orca; \
  rm /tmp/orca.AppImage

FROM node:22-bookworm-slim AS worker-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ubuntu:24.04 AS slicer-worker
ARG ORCA_VERSION=2.4.2
ENV NODE_ENV=production
ENV ORCA_VERSION=${ORCA_VERSION}
ENV ORCA_SLICER_PATH=/opt/orca/AppRun
ENV ORCA_PROFILES_PATH=/opt/orca/resources/profiles/Anycubic
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tini libstdc++6 libgl1 libegl1 libfontconfig1 libdbus-1-3 \
    libglib2.0-0t64 libgtk-3-0t64 libwebkit2gtk-4.1-0 libx11-6 libxext6 \
    libxi6 libxrender1 libxkbcommon0 libwayland-client0 libopengl0 libglu1-mesa \
    libsm6 libice6 libmspack0 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data/slicer-tmp
ENV TMPDIR=/app/data/slicer-tmp
COPY --from=worker-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=worker-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --from=orca /opt/orca /opt/orca
COPY server/db/schema.js ./server/db/schema.js
COPY server/utils/orcaSlicer.js server/utils/minio.js ./server/utils/
COPY utils/slicerProjectSettings.js utils/slicerHpp.js utils/kobraXHq016Process.js utils/hpp.js ./utils/
COPY scripts/slicer-worker.js ./scripts/slicer-worker.js
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/slicer-worker.js"]

# `docker build .` tetap menghasilkan image web. Compose memilih target worker
# secara eksplisit untuk service slicer-worker.
FROM app AS default
