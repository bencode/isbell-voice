# The speech service; Node runs its TypeScript as it is. Only src and the manifests are copied, never .env.
FROM node:24-alpine
RUN apk add --no-cache ffmpeg && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.ts"]
