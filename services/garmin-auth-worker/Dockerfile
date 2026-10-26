FROM node:22.23.4-alpine3.24
RUN apk add --no-cache 'ca-certificates>=20261020-r0'

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm install tsx

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 8787

CMD ["npx", "tsx", "src/server.ts"]
