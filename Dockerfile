# polyg-mcp MCP Server Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:20-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy TypeScript configuration
COPY tsconfig.json ./
COPY turbo.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/server/tsconfig.json ./packages/server/

# Copy source code for all packages
COPY packages/shared/src ./packages/shared/src
COPY packages/core/src ./packages/core/src
COPY packages/server/src ./packages/server/src

# Build all packages (turbo handles dependency order)
RUN pnpm build

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-alpine AS production

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the server (main.js is the CLI entry point)
CMD ["node", "packages/server/dist/main.js"]
