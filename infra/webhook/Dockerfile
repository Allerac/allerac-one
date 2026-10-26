FROM alpine:3.24

# Runtime tools: git (pull), docker-cli (compose commands), curl + jq (Resend API), envsubst (config template)
RUN apk add --no-cache bash curl git docker-cli docker-cli-compose jq gettext gcompat 'ca-certificates>=20261020-r0'

# Compose is supplied by the distribution and uses its corrected CA store.

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
