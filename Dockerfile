FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build info (commit hash and date baked into the image)
ARG COMMIT_HASH=unknown
ARG BUILD_DATE=unknown
RUN printf '{"commit":"%s","date":"%s"}' "$COMMIT_HASH" "$BUILD_DATE" > /app/build-info.json

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build || (echo "Build failed, showing logs..." && npm run build)

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

# Install postgresql-client for backup/restore functionality
RUN apk add --no-cache postgresql-client

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create backups directory
RUN mkdir -p /app/backups && chown nextjs:nodejs /app/backups

COPY --from=builder /app/src/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/build-info.json ./build-info.json

# Set the correct permission for prerender cache
RUN mkdir -p .next
RUN chown nextjs:nodejs .next

USER nextjs

EXPOSE 8080

ENV PORT 8080
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
