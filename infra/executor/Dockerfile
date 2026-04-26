FROM node:20-alpine

# Install tools the agent might need (docker-cli for self-update capability)
RUN apk add --no-cache bash curl git docker-cli

# Configure git for workspace operations
RUN git config --global user.name "Allerac User" && \
    git config --global user.email "allerac@developer"

WORKDIR /app
COPY server.js .

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# Run as non-root user for security
RUN addgroup -S executor && adduser -S executor -G executor
USER executor

CMD ["node", "server.js"]
