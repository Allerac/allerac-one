FROM node:20-alpine

RUN apk add --no-cache bash curl git

# Dedicated unprivileged user. Commands run with this uid, never root.
# uid/gid 10001 is referenced by docker-compose.yml (`user:`) and by the
# upgrade notes (chown of an existing workspace).
RUN addgroup -S -g 10001 executor \
    && adduser -S -D -u 10001 -G executor -h /workspace/.home -s /bin/bash executor \
    && mkdir -p /workspace/projects /workspace/.home \
    && chown -R executor:executor /workspace

# System-level git identity: works for the non-root user and with a
# read-only root filesystem (no ~/.gitconfig write needed).
# The credential helper hands $GH_TOKEN (set by server.js from the optional
# EXECUTOR_GITHUB_TOKEN) to git for https://github.com only, so clone/pull/push
# work without storing the token on disk. No token -> no credentials.
RUN git config --system user.name "Allerac User" && \
    git config --system user.email "allerac@developer" && \
    git config --system credential.https://github.com.helper \
      '!f() { test "$1" = get && test -n "$GH_TOKEN" && printf "username=x-access-token\npassword=%s\n" "$GH_TOKEN"; }; f'

WORKDIR /app
COPY server.js .

# HOME lives in the workspace volume so npm/pip caches are writable even
# though the container root filesystem is read-only.
ENV HOME=/workspace/.home \
    DEFAULT_CWD=/workspace

USER executor:executor

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "server.js"]
