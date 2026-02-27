FROM oven/bun:1.1-slim

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

ARG CACHE_BUST
COPY src/ ./src/

CMD ["bun", "run", "src/index.ts"]
