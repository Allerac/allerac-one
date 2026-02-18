FROM node:20-alpine

# Install tools the agent might need (docker-cli for self-update capability)
RUN apk add --no-cache bash curl git docker-cli

WORKDIR /app
COPY server.js .

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
