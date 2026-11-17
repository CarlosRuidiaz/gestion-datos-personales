# Se construye con el contexto en la raíz del repositorio (ver docker-compose.yml),
# porque necesita libs/common y el package-lock.json de la raíz.
FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund
RUN npm run build -w @gdp/common && npm run build -w ms-consultar
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "services/ms-consultar/dist/main.js"]
