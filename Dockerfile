FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build info (commit hash and date baked into the image)
ARG COMMIT_HASH=unknown
ARG BUILD_DATE=unknown
RUN printf '{"commit":"%s","date":"%s"}' "$COMMIT_HASH" "$BUILD_DATE" > /app/build-info.json

# NEXT_PUBLIC_* vars needed during build
ARG NEXT_PUBLIC_VISIBLE_DOMAINS
ENV NEXT_PUBLIC_VISIBLE_DOMAINS=${NEXT_PUBLIC_VISIBLE_DOMAINS}

ENV NEXT_TELEMETRY_DISABLED=1

# Cache .next/cache between builds — subsequent builds only recompile changed files
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

# Install postgresql-client for backup/restore functionality
RUN apk add --no-cache postgresql-client

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/backups && chown nextjs:nodejs /app/backups

COPY --from=builder /app/src/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/build-info.json ./build-info.json
COPY --from=builder --chown=nextjs:nodejs /app/skills ./skills

# Set the correct permission for prerender cache
RUN mkdir -p .next && chown nextjs:nodejs .next

USER nextjs

EXPOSE 8080

ENV PORT 8080
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
