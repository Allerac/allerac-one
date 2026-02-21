FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o notifier ./cmd/notifier

FROM alpine:latest
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/notifier /notifier

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health || exit 1

ENTRYPOINT ["/notifier"]
