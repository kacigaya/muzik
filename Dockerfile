FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim

# ffmpeg extracts the audio, python runs yt-dlp and the YouTube Music bridges.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3020 \
    MUZIK_PYTHON=/opt/venv/bin/python \
    MUZIK_YTDLP=/opt/venv/bin/yt-dlp \
    MUZIK_DEFAULT_MUSIC_DIR=/music \
    MUZIK_DATA_DIR=/data \
    MUZIK_TEMP_DIR=/tmp/muzik

COPY requirements.txt ./
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY instrumentation.ts next.config.ts tsconfig.json ./

# Runs unprivileged; mounted volumes have to be writable by uid 1000.
RUN mkdir -p /music /data && chown -R node:node /app /music /data
USER node

VOLUME ["/music", "/data"]
EXPOSE 3020

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3020)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
