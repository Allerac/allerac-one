#!/bin/bash
# Deploy Allerac Skills System Phase 1 MVP to VM
# Run this script on the VM after pulling latest code

set -e  # Exit on error

echo "🚀 Deploying Allerac Skills System Phase 1 MVP..."

# 1. Pull latest code
echo "📥 Pulling latest code from GitHub..."
cd ~/allerac-one
git pull origin main

# 2. Stop running services
echo "🛑 Stopping services..."
docker compose --profile production --profile telegram down

# 3. Rebuild Docker images
echo "🏗️ Building Docker images..."
docker compose build

# 4. Start database only
echo "🗃️ Starting database..."
docker compose up -d db

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# 5. Run migrations
echo "📊 Running migrations..."
docker compose exec -T db psql -U postgres -d allerac -f /database/migrations/003_skills_system.sql

# 6. Seed skills
echo "🌱 Seeding initial skills..."
docker compose exec -T db psql -U postgres -d allerac -f /database/seed-data/004_seed_skills.sql

# 7. Start all services
echo "🚀 Starting all services..."
docker compose --profile production --profile telegram up -d

# 8. Show status
echo "✅ Deployment complete!"
echo ""
echo "📊 Service status:"
docker compose ps

echo ""
echo "📝 Skills in database:"
docker compose exec -T db psql -U postgres -d allerac -c "SELECT name, display_name, learning_enabled, rag_integration FROM skills WHERE user_id IS NULL;"

echo ""
echo "🎯 Test via Telegram:"
echo "  - /skills - List available skills"
echo "  - /skill personal-assistant - Activate personal assistant"
echo "  - /skill_info - Show current skill details"
