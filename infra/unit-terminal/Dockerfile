# Unit terminal: the unmodified Claude Code and Codex CLIs behind the
# authenticated terminal service (server.mjs). One image, two compose services
# (terminal-claude, terminal-codex) selected by UNIT_TERMINAL_PROVIDER.
# See docs/roadmap/unit-terminal-container.md.

FROM node:22.23.4-bookworm-slim AS deps
# node-pty is a native addon.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.23.4-bookworm-slim
# Pinned CLI versions: rebuild the image to upgrade (self-update is disabled,
# the root filesystem is read-only at runtime).
ARG CLAUDE_CODE_VERSION=2.1.331
ARG CODEX_VERSION=0.167.2

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates bash git ripgrep curl less procps openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@openai/codex@${CODEX_VERSION}" \
    && npm cache clean --force

# Unprivileged user. /home/terminal (CLI logins, settings, Allerac API
# connection) and /workspace are volumes; the image directories set their
# initial ownership.
RUN groupadd -g 10001 terminal \
    && useradd -u 10001 -g terminal -d /home/terminal -s /bin/bash -m terminal \
    && mkdir -p /workspace /home/terminal/.config/allerac/terminal /home/terminal/.codex \
    && chown -R terminal:terminal /workspace /home/terminal

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.mjs api-connection.mjs allerac-mcp.mjs ./

ENV HOME=/home/terminal \
    CODEX_HOME=/home/terminal/.codex \
    UNIT_TERMINAL_HOST=0.0.0.0 \
    UNIT_TERMINAL_CWD=/workspace \
    ALLERAC_TERMINAL_API_URL=http://app:8080 \
    DISABLE_AUTOUPDATER=1 \
    NODE_ENV=production

USER terminal
CMD ["node", "server.mjs"]
