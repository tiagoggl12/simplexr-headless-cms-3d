# Admin Frontend Dockerfile - Production
FROM node:20-alpine AS deps
WORKDIR /app
COPY admin/package*.json ./
RUN npm ci
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY admin ./admin/
RUN npm run build --prefix admin
FROM nginx:alpine AS runtime
COPY docker/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/admin/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
