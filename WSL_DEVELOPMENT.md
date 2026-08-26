# Local Development in WSL (Non-Docker)

This guide explains how to run the full stack directly within Windows Subsystem for Linux (WSL) to save disk space and system resources compared to Docker Desktop.

## 1. System Dependencies

Open your WSL terminal and install the required services and media processing tools:

```bash
# 1. Update and install Node.js (v20+)
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install PostgreSQL and Redis
sudo apt install -y postgresql redis-server

# 3. Install Media Tools (FFmpeg and yt-dlp)
sudo apt install -y ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## 2. Service Configuration

### Start Services
```bash
sudo service postgresql start
sudo service redis-server start
```

### Setup Database
Create the user and database as defined in your `.env`:

```bash
# Enter PostgreSQL shell
sudo -u postgres psql

# Run these SQL commands:
CREATE USER postgres WITH PASSWORD '12341738';
CREATE DATABASE video_downloader OWNER postgres;
\q
```

## 3. Environment Setup

Ensure your root `.env` file uses `localhost` for services since they are now running in the same WSL environment as your code:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=12341738
POSTGRES_DB=video_downloader
DATABASE_URL=postgresql://postgres:12341738@localhost:5432/video_downloader

# Redis
REDIS_URL=redis://localhost:6379

# Temp storage (ensure this directory exists in WSL)
TEMP_DIR=/var/tmp/video-downloader
```

Create the temp directory:
```bash
sudo mkdir -p /var/tmp/video-downloader
sudo chown $(whoami) /var/tmp/video-downloader
```

## 4. Application Build & Run

From the project root:

```bash
# 1. Install dependencies
npm ci

# 2. Build internal packages (Critical step)
npm run build:packages

# 3. Setup Database Schema
npm run db:generate
npm run db:migrate

# 4. Start Development Servers
# It is recommended to run these in separate terminal windows or tabs:
npm run dev:api     # API on http://localhost:4000
npm run dev:worker  # Background processing
npm run dev:web     # Frontend on http://localhost:3000
```

## Troubleshooting

- **Redis Connection**: If the worker can't connect, check if redis is bound to `127.0.0.1` in `/etc/redis/redis.conf`.
- **yt-dlp version**: If downloads fail, update yt-dlp: `sudo yt-dlp -U`.
- **Memory usage**: WSL can consume significant RAM. You can limit this by creating a `%USERPROFILE%\.wslconfig` file in Windows.
