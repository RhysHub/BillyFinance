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

RUN mkdir -p /data

ENV DB_PATH=/data/billy.db
ENV PORT=4823

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4823
ENTRYPOINT ["/entrypoint.sh"]
