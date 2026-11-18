FROM node:22-alpine
RUN apk add --no-cache android-tools
WORKDIR /app
COPY package.json adb.js ui.js server.js viewer.html ./
ENV PORT=8700 ADB_SERIAL=redroid:5555
EXPOSE 8700
HEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:8700/healthz || exit 1
CMD ["node", "server.js"]
