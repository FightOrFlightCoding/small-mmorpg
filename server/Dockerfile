FROM node:20.20.2-alpine AS node-builder

WORKDIR /backend

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json rollup.config.mjs babel.config.json ./
COPY src ./src
RUN npm run build

FROM heroiclabs/nakama:3.40.0

COPY --from=node-builder /backend/build/index.js /nakama/data/modules/build/index.js
