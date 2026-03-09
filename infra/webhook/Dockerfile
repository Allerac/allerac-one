FROM alpine:3.19

# Runtime tools: git (pull), docker-cli (compose commands), curl + jq (Resend API), envsubst (config template)
RUN apk add --no-cache bash curl git docker-cli jq gettext

# Docker Compose v2
RUN curl -fsSL "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose \
  && chmod +x /usr/local/bin/docker-compose

# webhook binary (adnanh/webhook)
ARG WEBHOOK_VERSION=2.8.1
RUN curl -fsSL "https://github.com/adnanh/webhook/releases/download/${WEBHOOK_VERSION}/webhook-linux-amd64" \
    -o /usr/local/bin/webhook \
  && chmod +x /usr/local/bin/webhook

EXPOSE 9000

COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
