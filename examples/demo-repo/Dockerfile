FROM node:22 AS base
WORKDIR /app

FROM base AS test-base
COPY . .
RUN npm test

FROM base AS builder
COPY . .
RUN npm run build

FROM node:22-slim AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
