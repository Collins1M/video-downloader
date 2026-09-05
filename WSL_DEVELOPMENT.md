# WSL Development Guide

This guide covers two ways to run the Video Downloader project within Windows Subsystem for Linux (WSL).

---

## Option A: Running with Docker (Recommended)

This is the simplest way to get started. It uses Docker to manage the database, Redis, and application services, ensuring all dependencies are isolated.

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on Windows with **WSL 2 backend** enabled.
- Alternatively, Docker Engine installed directly inside your WSL distribution.

### 2. Setup & Run
Open your WSL terminal in the project root:

```bash
# 1. Create environment file
cp .env.example .env

# 2. Start the full stack
docker compose up --build
```

The API will be available at `http://localhost:4000` and the Admin/Web apps on their respective ports.

---

## Option B: Running without Docker (High Performance)

Run services directly in WSL for maximum performance and lower memory overhead. This is ideal for machines with limited RAM.

### 1. Install System Dependencies
Open your WSL terminal:

```bash
# Update and install Node.js (v22+)
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL and Redis
sudo apt install -y postgresql redis-server

# Install Media Tools (FFmpeg and yt-dlp)
sudo apt install -y ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 2. Configure & Start Services
```bash
# Start the services
sudo service postgresql start
sudo service redis-server start

# Create the database user (match your .env)
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD '12341738';"
sudo -u postgres psql -c "CREATE DATABASE video_downloader OWNER postgres;"

# Create temp storage directory
sudo mkdir -p /var/tmp/video-downloader
sudo chown $(whoami) /var/tmp/video-downloader
```

### 3. Environment Setup
Update your `.env` to point to `localhost` instead of docker service names:

```env
DATABASE_URL=postgresql://postgres:12341738@localhost:5432/video_downloader
REDIS_URL=redis://localhost:6379
TEMP_DIR=/var/tmp/video-downloader
```

### 4. Application Run
> [!IMPORTANT]
> **Performance Tip:** Ensure your project is located in the native Linux filesystem (e.g., `~/projects/`) rather than a Windows mount (`/mnt/d/`). Node operations are 20-50x faster in the home directory.

```bash
npm install
npm run db:generate
npm run build:packages
npm run db:migrate

# Start the apps (in separate terminals)
npm run dev:api
npm run dev:worker
```

---

## Troubleshooting

- **Redis Connection**: If the worker can't connect, ensure `redis-server` is running: `sudo service redis-server status`.
- **yt-dlp version**: If extraction fails, update it: `sudo yt-dlp -U`.
- **WSL Memory Limit**: If WSL is using too much RAM, create a `.wslconfig` file in your Windows user profile (`%USERPROFILE%`) to limit its resource consumption.
