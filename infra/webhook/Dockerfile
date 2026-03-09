FROM alpine:3.19

# Runtime tools: git (pull), docker-cli (compose commands), curl + jq (Resend API), envsubst (config template)
RUN apk add --no-cache bash curl git docker-cli jq gettext

# Docker Compose v2
RUN curl -fsSL "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose \
  && chmod +x /usr/local/bin/docker-compose

# webhook binary (adnanh/webhook)
# tar.gz contains a top-level dir (webhook-linux-amd64/webhook) — strip it
ARG WEBHOOK_VERSION=2.8.1
RUN curl -fsSL "https://github.com/adnanh/webhook/releases/download/${WEBHOOK_VERSION}/webhook-linux-amd64.tar.gz" \
    -o /tmp/webhook.tar.gz \
  && tar -xzf /tmp/webhook.tar.gz --strip-components=1 -C /usr/local/bin \
  && chmod +x /usr/local/bin/webhook \
  && rm /tmp/webhook.tar.gz

EXPOSE 9000

COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
