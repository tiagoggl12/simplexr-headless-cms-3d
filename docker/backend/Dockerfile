# =============================================================================
# Backend Dockerfile - Production
# =============================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init curl
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    mkdir -p /app && \
    chown -R nodejs:nodejs /app
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --chown=nodejs:nodejs . .
USER nodejs
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
