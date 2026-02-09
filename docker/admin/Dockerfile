# =============================================================================
# Admin Frontend Dockerfile - Multi-stage build for production
# =============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY admin/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY admin ./admin/

# Build the application
RUN npm run build --prefix admin

# =============================================================================
# Stage 2: Runtime - Nginx
# =============================================================================
FROM nginx:alpine AS runtime

# Install curl for health check
RUN apk add --no-cache curl

# Copy nginx configuration
COPY docker/admin/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/admin/dist /usr/share/nginx/html

# Set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
