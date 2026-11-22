# Construye la aplicación con Vite y la sirve con Nginx. Contexto: la carpeta frontend/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/40-config-js.sh /docker-entrypoint.d/40-config-js.sh
RUN chmod +x /docker-entrypoint.d/40-config-js.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/config.js > /dev/null || exit 1
