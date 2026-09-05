# Video Downloader — Backend

This is the core engine of the Video Downloader project. It handles video analysis, processing queues, and media extraction.

## Project structure

```
video-downloader-backend/
├── apps/
│   ├── api/       NestJS REST API + BullMQ producer
│   └── worker/    BullMQ consumer, FFmpeg processing
├── packages/
│   ├── types/            Shared TS contracts
│   ├── config/           Shared env var schema
│   ├── security/         SSRF-hardened URL validator
│   ├── media-extractor/  yt-dlp wrapper
│   └── database/         Prisma schema + generated client
├── docker/        Dockerfiles
├── docker-compose.yml
└── .env.example
```

## Getting Started

### 1. System Dependencies
Ensure you have `ffmpeg` and `yt-dlp` installed on your system if running locally.

### 2. Setup
```bash
cp .env.example .env
npm install
npm run build:packages
npm run db:generate
npm run db:migrate
```

### 3. Run (Local)
Run in separate terminals:
```bash
npm run dev:api     # http://localhost:4000
npm run dev:worker
```

### 4. Run in WSL (Non-Docker)
For a lightweight setup without Docker, see [WSL_DEVELOPMENT.md](file:///D:/Local Disk/Angular/video-downloader-backend/WSL_DEVELOPMENT.md).

### 5. Redis for Windows
If you are running directly on Windows (not WSL) and don't want to use Docker:
- **Memurai**: A Redis-compatible datastore for Windows (Recommended).
- **Redis on WSL**: Install Redis in WSL and connect to it from Windows.
- **Managed Redis**: Use a free tier from Redis Labs or Upstash.

### 6. Run with Docker
```bash
docker compose up --build
```

## Running the Full Stack
This backend provides the API for:
1. **Frontend**: Located in `video-downloader-frontend`.
2. **Admin**: Located in `video-downloader-admin`.

Ensure the `NEXT_PUBLIC_API_URL` in those projects points to this backend's API (default `http://localhost:4000`).
