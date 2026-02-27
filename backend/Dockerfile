FROM oven/bun:1.1-slim

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

ARG CACHE_BUST
COPY src/ ./src/

# Seed script runs at startup via entrypoint
CMD ["sh", "-c", "bun run src/seed.ts && bun run src/index.ts"]
