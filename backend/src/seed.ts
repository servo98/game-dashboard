/**
 * Seeds the database with game configs from games/*.json
 * Run with: bun run src/seed.ts
 */
import { db } from "./db";
import { join } from "path";
import { readdirSync, readFileSync } from "fs";

const seedInsert = db.query<void, [string, string, string, string, number, string, string]>(
  "INSERT OR IGNORE INTO servers (id, name, game_type, docker_image, port, env_vars, volumes) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

const gamesDir = join(import.meta.dir, "../games");
const files = readdirSync(gamesDir).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const config = JSON.parse(readFileSync(join(gamesDir, file), "utf8"));
  seedInsert.run(
    config.id,
    config.name,
    config.game_type,
    config.docker_image,
    config.port,
    JSON.stringify(config.env_vars ?? {}),
    JSON.stringify(config.volumes ?? {})
  );
  console.log(`Seeded: ${config.name}`);
}

console.log("Done.");
process.exit(0);
