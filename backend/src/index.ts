import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sessionQueries } from "./db";
import authRoutes from "./routes/auth";
import serverRoutes from "./routes/servers";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      process.env.PUBLIC_URL ?? "http://localhost:5173",
      "http://localhost:5173",
      "http://localhost:4173",
    ],
    credentials: true,
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);
app.route("/api/servers", serverRoutes);

// Periodic session cleanup (every hour)
setInterval(
  () => {
    sessionQueries.cleanup.run();
  },
  60 * 60 * 1000
);

const port = Number(process.env.BACKEND_PORT ?? 3000);
console.log(`Backend running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
