# AgentGuard Self-hosted Setup Guide

This guide explains how to deploy AgentGuard on your own infrastructure for Enterprise customers.

## Prerequisites

- Docker and Docker Compose installed
- PostgreSQL 15+ (or use provided Docker image)
- Redis 7+ (or use provided Docker image)
- Enterprise license key from AgentGuard
- Minimum 4GB RAM, 2 CPU cores
- 20GB+ disk space

## Quick Start

1. **Clone or download AgentGuard**
   ```bash
   git clone https://github.com/agentguard/agentguard.git
   cd agentguard
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env.self-hosted
   ```

3. **Configure environment variables**
   Edit `.env.self-hosted` and set:
   ```env
   # Database
   POSTGRES_USER=agentguard
   POSTGRES_PASSWORD=your-strong-password-here
   POSTGRES_DB=agentguard
   POSTGRES_PORT=5432

   # Redis
   REDIS_PASSWORD=your-redis-password-here
   REDIS_PORT=6379

   # Security
   SECRET_KEY=generate-a-strong-random-key-here
   # Generate with: openssl rand -hex 32

   # Self-hosted
   SELF_HOSTED_MODE=true
   SELF_HOSTED_LICENSE_KEY=your-enterprise-license-key

   # CORS (set to your domain)
   CORS_ORIGINS=https://your-domain.com

   # Frontend
   NEXT_PUBLIC_API_URL=http://localhost:8000
   # Or: https://api.your-domain.com

   # Optional: LLM Provider Keys (if using AgentGuard proxy)
   OPENAI_API_KEY=your-openai-key
   ANTHROPIC_API_KEY=your-anthropic-key
   GOOGLE_API_KEY=your-google-key

   # Optional: Email (Resend)
   RESEND_API_KEY=your-resend-key
   EMAIL_FROM=noreply@your-domain.com
   EMAIL_FROM_NAME=AgentGuard

   # Optional: Slack
   SLACK_WEBHOOK_URL=your-slack-webhook

   # Optional: Sentry
   SENTRY_DSN=your-sentry-dsn
   SENTRY_ENVIRONMENT=self-hosted
   ```

4. **Start services**
   ```bash
   docker-compose -f docker-compose.self-hosted.yml --env-file .env.self-hosted up -d
   ```

5. **Run database migrations**
   ```bash
   docker-compose -f docker-compose.self-hosted.yml exec backend alembic upgrade head
   ```

6. **Verify installation**
   - Backend: http://localhost:8000/health
   - Frontend: http://localhost:3000

## Configuration

### Database Setup

The self-hosted deployment includes PostgreSQL. For production, consider:
- Using an external managed PostgreSQL (AWS RDS, Google Cloud SQL, etc.)
- Setting up regular backups
- Configuring replication for high availability

### Redis Setup

Redis is used for caching and streaming. For production:
- Use Redis Cluster for high availability
- Configure persistence (AOF or RDB)
- Set up monitoring

### Security

1. **Change all default passwords**
2. **Use strong SECRET_KEY** (generate with `openssl rand -hex 32`)
3. **Configure CORS_ORIGINS** to your domain only
4. **Use HTTPS** in production (set up reverse proxy with nginx/traefik)
5. **Keep license key secure** (store in environment variables, not in code)

### Reverse Proxy (Production)

For production, use nginx or traefik as reverse proxy:

```nginx
# nginx.conf example
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Data Migration

### Initial Setup

On first run, migrations are applied automatically. To manually run:

```bash
docker-compose -f docker-compose.self-hosted.yml exec backend alembic upgrade head
```

### Backup and Restore

**Backup PostgreSQL:**
```bash
docker-compose -f docker-compose.self-hosted.yml exec postgres pg_dump -U agentguard agentguard > backup.sql
```

**Restore PostgreSQL:**
```bash
docker-compose -f docker-compose.self-hosted.yml exec -T postgres psql -U agentguard agentguard < backup.sql
```

**Backup Redis:**
```bash
docker-compose -f docker-compose.self-hosted.yml exec redis redis-cli --rdb /data/dump.rdb
```

## Monitoring

### Health Checks

- Backend: `GET http://localhost:8000/health`
- Frontend: `GET http://localhost:3000`

### Logs

View logs:
```bash
# All services
docker-compose -f docker-compose.self-hosted.yml logs -f

# Specific service
docker-compose -f docker-compose.self-hosted.yml logs -f backend
```

### Metrics

Optional: Set up Prometheus/Grafana for metrics collection.

## Troubleshooting

### Database Connection Issues

1. Check PostgreSQL is running: `docker-compose ps postgres`
2. Verify connection string in `.env.self-hosted`
3. Check logs: `docker-compose logs postgres`

### Redis Connection Issues

1. Check Redis is running: `docker-compose ps redis`
2. Verify password matches in `.env.self-hosted`
3. Test connection: `docker-compose exec redis redis-cli ping`

### License Issues

1. Verify `SELF_HOSTED_LICENSE_KEY` is set correctly
2. Check license status: `GET /api/v1/self-hosted/status`
3. Contact AgentGuard support if license is invalid

## Support

For Enterprise self-hosted support:
- Email: enterprise@agentguard.ai
- Documentation: https://docs.agentguard.ai/self-hosted
- Support Portal: https://support.agentguard.ai

## License

Self-hosted deployment requires an Enterprise license. Contact sales@agentguard.ai for licensing information.
