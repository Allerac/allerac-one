FROM alpine:3.19

# Runtime tools: git (pull), docker-cli (compose commands), curl + jq (Resend API), envsubst (config template)
RUN apk add --no-cache bash curl git docker-cli jq gettext gcompat

# Docker Compose v2
RUN curl -fsSL "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose \
  && chmod +x /usr/local/bin/docker-compose

# webhook binary (adnanh/webhook)
ARG WEBHOOK_VERSION=2.8.1
RUN curl -fsSL "https://github.com/adnanh/webhook/releases/download/${WEBHOOK_VERSION}/webhook-linux-amd64.tar.gz" \
    -o /tmp/webhook.tar.gz \
  && tar -xzf /tmp/webhook.tar.gz -C /tmp \
  && BIN=$(find /tmp -type f -name webhook | head -1) \
  && [ -n "$BIN" ] || { echo "ERROR: webhook binary not found in tar"; exit 1; } \
  && install -m 755 "$BIN" /usr/local/bin/webhook \
  && rm -rf /tmp/webhook* \
  && webhook --version

EXPOSE 9000

COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
