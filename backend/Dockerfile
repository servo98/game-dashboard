FROM oven/bun:1.1-slim

# zstd for fast backup compression, util-linux for ionice (low-priority I/O)
RUN apt-get update && apt-get install -y --no-install-recommends zstd util-linux && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

ARG CACHE_BUST
COPY src/ ./src/

# Seed script runs at startup via entrypoint
CMD ["sh", "-c", "bun run src/seed.ts && bun run src/index.ts"]
