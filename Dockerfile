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
    MUZIK_MUSIC_DIR=/music \
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
COPY scripts ./scripts
COPY next.config.ts tsconfig.json ./

VOLUME ["/music", "/data"]
EXPOSE 3020

CMD ["npm", "run", "start"]
