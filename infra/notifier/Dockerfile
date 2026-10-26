# syntax=docker/dockerfile:1

FROM golang:1.26.10-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
  attempt=1; \
  while [ "$attempt" -le 5 ]; do \
    go mod download && exit 0; \
    echo "go mod download failed (attempt $attempt/5); retrying..." >&2; \
    sleep "$((attempt * 10))"; \
    attempt="$((attempt + 1))"; \
  done; \
  exit 1

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,target=/root/.cache/go-build,sharing=locked \
  go build -o notifier ./cmd/notifier

FROM alpine:3.24
RUN apk add --no-cache 'ca-certificates>=20261020-r0'

COPY --from=builder /app/notifier /notifier

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health || exit 1

ENTRYPOINT ["/notifier"]
