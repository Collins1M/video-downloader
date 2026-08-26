# Video Downloader — Docker Containerization Guide

## Overview

Your project has been containerized with production-ready multi-stage Dockerfiles and a comprehensive docker-compose setup. All three services (web, api, worker) follow Docker best practices.

## What Changed

### 1. `.dockerignore` (NEW)
Excludes unnecessary files from the build context, reducing transfer time and build size:
- `node_modules/`, `.git/`, `dist/`, `.next/`, `coverage/`, `docs/`, `scripts/`, etc.

### 2. **Updated Dockerfiles** (`docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/worker.Dockerfile`)

**Key improvements:**
- **Security hardening**: Added non-root user (`nodejs:1001:1001`) to run services securely
- **Reduced bloat**: `npm ci --audit=false` skips unnecessary checks on production builds
- **Layer reordering**: `EXPOSE` and `HEALTHCHECK` moved after final `COPY` for better caching
- **Consistent patterns**: All follow identical multi-stage patterns (deps → builder → runner)

**Example (api.Dockerfile):**
```dockerfile
# deps stage: Install all dependencies (with devDependencies)
# builder stage: Compile and build the app
# runner stage: Production-only deps + runtime tools (yt-dlp, Python, FFmpeg)
USER nodejs  # Run as non-root
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
```

### 3. **Enhanced docker-compose.yml**

**New features:**
- **Named network** (`internal`): All services isolated on a private bridge network; Nginx binds only port 80 to host
- **Healthchecks on all services**: Web, API, Worker, PostgreSQL, Redis, Nginx
- **Redis persistence**: `--appendonly yes` for durability
- **PostgreSQL performance tuning**: `shared_buffers=256MB`, `max_connections=200`
- **Explicit service dependencies** with conditions
- **Restart policies**: `unless-stopped` for resilience
- **Security defaults**: No unnecessary port bindings between containers

**Service-to-service communication:**
- Web → API via `http://api:4000` (no port binding exposed)
- API & Worker → PostgreSQL via `postgres:5432` (internal only)
- API & Worker → Redis via `redis:6379` (internal only)
- External access: Nginx on port 80 → Web/API

## Quick Start

### 1. **Environment Setup**

Create a `.env` file from the example:
```bash
cp .env.example .env
```

Edit `.env` with production values:
```bash
NODE_ENV=production
POSTGRES_PASSWORD=your-secure-password-here
ADMIN_PASSWORD=your-admin-password-here
DATABASE_URL=postgresql://video_downloader:your-secure-password-here@postgres:5432/video_downloader
REDIS_URL=redis://redis:6379
```

### 2. **Build All Images**

```bash
docker compose build
```

This builds three images:
- `video-downloader-web:latest` (Next.js frontend, ~400MB)
- `video-downloader-api:latest` (NestJS API + yt-dlp, ~800MB)
- `video-downloader-worker:latest` (Video processor + FFmpeg, ~1.2GB)

### 3. **Start the Stack**

```bash
docker compose up --pull always
```

This starts all services with dependencies respected:
- PostgreSQL & Redis start first
- API/Worker wait for PostgreSQL and Redis readiness
- Web waits for API healthcheck
- Nginx waits for both Web and API healthchecks

### 4. **Verify Deployment**

```bash
# Check running containers
docker compose ps

# View logs for a specific service
docker compose logs api
docker compose logs worker

# Stream logs from all services
docker compose logs -f

# Test API health
curl -f http://localhost/api/health || echo "API not ready"

# Access web UI
open http://localhost
```

## Scaling Workers

Process multiple videos in parallel:

```bash
# Scale to 3 concurrent workers (each processes independently)
docker compose up --scale worker=3
```

**Note:** Worker metrics expose on port 9091 internally; Prometheus should scrape all replicas via the internal network.

## Production Deployment Checklist

- [ ] Use a `.env.production` file with secrets from your secrets manager (not hardcoded)
- [ ] Set `NODE_ENV=production` in all services
- [ ] Configure persistent volumes on a separate storage layer (NFS, cloud storage)
- [ ] Use a reverse proxy (Nginx already included) with TLS termination
- [ ] Set up monitoring: Prometheus scrapes worker:9091 for metrics
- [ ] Enable database backups: PostgreSQL `pg_dump` on a cron schedule
- [ ] Configure log aggregation: Send logs to Sentry, ELK, or Datadog via `SENTRY_DSN`
- [ ] Use Docker secrets or environment managers (not `.env` files) in production
- [ ] Implement rate limiting and DDoS protection at the ingress layer
- [ ] Test disaster recovery: delete volumes and verify data restoration

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Host (Port 80)                        │
│                    (Nginx Reverse Proxy)                  │
└──────────────┬───────────────────────────────┬────────────┘
               │                               │
        ┌──────▼──────┐              ┌─────────▼────┐
        │  Web (3000) │              │  API (4000)  │
        │  Next.js    │              │  NestJS      │
        └──────┬──────┘              │  yt-dlp      │
               │                     └─────────┬────┘
               │     Shared Temp Volume         │
               └──────┬──────────────────┬──────┘
                      │                  │
        ┌─────────────▼──────────────────▼─────────────┐
        │  Worker (×N)  /  Redis  /  PostgreSQL         │
        │  FFmpeg       (6379)     (5432)               │
        │  yt-dlp       Pub/Sub    Data Store           │
        └─────────────────────────────────────────────────┘

All services on internal bridge network; Nginx only external ingress.
```

## Monitoring & Observability

### Logs
```bash
# Stream all logs with timestamps
docker compose logs -f --timestamps

# Filter by service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail 100 api
```

### Health Checks
```bash
# View healthcheck status
docker compose ps

# Inspect a specific container
docker inspect video-downloader-api-1 | jq '.State.Health.Status'
```

### Metrics (Worker)
Worker exposes Prometheus metrics on port 9091 (internal network).

Configure Prometheus in a separate container:
```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "9090:9090"
    networks:
      - internal
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
```

Example `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'video-downloader-worker'
    static_configs:
      - targets: ['worker:9091']
```

## Cleanup

```bash
# Stop all services
docker compose down

# Remove volumes (DATA LOSS!)
docker compose down -v

# Remove images
docker image rm video-downloader-{web,api,worker}:latest
```

## Troubleshooting

### Build Fails: "npm ci: command not found"
The `node:20-slim` base image includes npm. If this error occurs, verify the Dockerfile syntax and that the context is correct.

### Container Won't Start
```bash
# Check logs
docker compose logs api

# Inspect container
docker compose ps
docker inspect video-downloader-api-1
```

### Database Connection Refused
```bash
# Verify PostgreSQL is healthy
docker compose ps postgres

# Check network connectivity from API
docker compose exec api curl -f http://postgres:5432 || echo "Connection failed"
```

### Out of Memory
```bash
# Check system resource usage
docker stats

# View container memory limit
docker inspect video-downloader-api-1 | jq '.HostConfig.MemorySwap'

# Increase memory in docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

## Security Best Practices Applied

✓ Non-root user (`nodejs:1001:1001`)  
✓ Private bridge network (internal service isolation)  
✓ No hardcoded secrets (environment variables only)  
✓ Read-only mounts where possible (`nginx.conf:ro`)  
✓ Minimal base images (`node:20-slim`, `alpine` variants)  
✓ Health checks prevent cascading failures  
✓ Restart policies auto-recover from crashes  

## Next Steps

1. **Push to Registry**: `docker tag video-downloader-api:latest your-registry.com/video-downloader-api:latest && docker push ...`
2. **Set Up CI/CD**: GitHub Actions / GitLab CI to build and push on commits
3. **Deploy to Orchestrator**: Docker Swarm or Kubernetes for multi-node deployments
4. **Add TLS/HTTPS**: Configure Nginx with Let's Encrypt certificates
5. **Implement Auto-scaling**: Use Docker Swarm services or Kubernetes HPA for dynamic worker scaling

## References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
