# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /app

# Native module build deps (for better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./

# Copy built frontend to be served as static files
COPY --from=frontend-builder /build/dist ./public

RUN mkdir -p /data && chown -R node:node /data /app

ENV DB_PATH=/data/billy.db
ENV PORT=3000

EXPOSE 3000
USER node
CMD ["node", "server.js"]
