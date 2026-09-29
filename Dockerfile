# Образ для запуска платформы. Интерфейс уже собран (client/dist).
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY client/dist ./client/dist
VOLUME ["/app/data"]
EXPOSE 8080
CMD ["node", "server/index.js"]
