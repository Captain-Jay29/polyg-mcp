#!/bin/bash
# First-time setup script for polyg-mcp

set -e

echo "Setting up polyg-mcp..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting." >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required but not installed. Aborting." >&2; exit 1; }

# Copy environment file if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file - please add your OPENAI_API_KEY"
fi

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build packages
echo "Building packages..."
pnpm build

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your OPENAI_API_KEY"
echo "  2. Run: docker-compose up -d"
echo "  3. Verify: curl http://localhost:3000/health"
