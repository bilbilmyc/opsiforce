FROM registry.cn-beijing.aliyuncs.com/mayc/node:24.18.0-alpine AS builder
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY ui/ ./
RUN npm run build-enterprise
FROM registry.cn-beijing.aliyuncs.com/mayc/nginx:1.28.0-alpine
COPY --from=builder /src/ui/out/ /usr/share/nginx/html/
COPY opsiforce-nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
