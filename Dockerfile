FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder /app .
RUN pnpm install --prod --frozen-lockfile
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
