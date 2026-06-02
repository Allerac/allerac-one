FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm install tsx

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 8787

CMD ["npx", "tsx", "src/server.ts"]
