# Docker Quick Start

## 🚀 Start Everything

```bash
cd backend
docker-compose up -d
```

**Services will be available at:**
- Backend API: http://localhost:5001
- API Documentation: http://localhost:5001/api-docs
- Mongo Express (DB UI): http://localhost:8081 (admin/admin123)
- MongoDB: localhost:27017
- Redis: localhost:6379

## 📋 First Time Setup

After starting containers, initialize the database:

```bash
# Create indexes
docker-compose exec app npm run create-indexes

# Seed sample data (optional)
docker-compose exec app npm run seed:data

# Create admin user
docker-compose exec app npm run setup:admin
```

## 🔍 View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f mongo
```

## 🛑 Stop Services

```bash
# Stop containers (keeps data)
docker-compose stop

# Stop and remove containers (keeps volumes/data)
docker-compose down

# Stop and remove everything including data
docker-compose down -v
```

## 🔧 Common Commands

```bash
# Check service status
docker-compose ps

# Restart a service
docker-compose restart app

# Access container shell
docker-compose exec app sh

# Run npm commands
docker-compose exec app npm run seed
docker-compose exec app npm test

# View MongoDB shell
docker-compose exec mongo mongosh
```

## ⚠️ Troubleshooting

### Port 5000 Already in Use (macOS)
Port 5000 is used by AirPlay Receiver on macOS. The docker-compose.yml is configured to use port 5001 instead.

**Access backend at:** http://localhost:5001

### Update Frontend .env
If using the frontend, update the API URL:
```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
```

### Container Won't Start
```bash
# Check logs
docker-compose logs app

# Rebuild without cache
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Issues
```bash
# Check if MongoDB is running
docker-compose ps

# Test connection from app container
docker-compose exec app ping mongo
```

## 📊 Monitor Resources

```bash
# View resource usage
docker stats

# View disk usage
docker system df
```

## 🧹 Clean Up

```bash
# Remove unused containers and images
docker system prune

# Remove all unused volumes (WARNING: deletes data!)
docker system prune -a --volumes
```

## 📚 Full Documentation

For detailed setup, production deployment, and advanced configuration, see:
- [Docker Setup Guide](../README/DOCKER_SETUP_GUIDE.md)
- [Backend README](README.md)
