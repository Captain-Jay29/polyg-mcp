# Deployment

## Local Development

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f polyg-mcp

# Stop services
docker-compose down
```

## Production Deployment

### Docker Compose (VPS)

```bash
# On your server
git clone https://github.com/yourname/polyg-mcp.git
cd polyg-mcp
cp .env.example .env
# Edit .env with production values

docker-compose up -d
```

### Environment Overrides

Create `docker-compose.override.yml` for production:

```yaml
services:
  polyg-mcp:
    environment:
      - API_KEY_REQUIRED=true
      - ALLOWED_ORIGINS=https://your-domain.com

  falkordb:
    ports: []  # Don't expose DB externally
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name polyg.your-domain.com;

    location /mcp {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Health Checks

```bash
# Check server health
curl http://localhost:3000/health

# Expected response
{
  "status": "ok",
  "falkordb": "connected",
  "graphs": 4,
  "uptime": 3600
}
```

## Backup & Restore

```bash
# Backup FalkorDB data
docker exec polyg-mcp-falkordb-1 redis-cli BGSAVE

# Data is stored in the falkordb_data volume
docker volume inspect polyg-mcp_falkordb_data
```
