import { mkdtempSync, rmSync } from "fs";
import { createServer, type Server, type Socket } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Un Docker de mentira que solo sabe responder al stream de stats: contesta
 * con chunked encoding y manda una línea JSON cada pocos milisegundos hasta
 * que el cliente cuelga. Sirve para comprobar que el lector crudo interpreta
 * bien el cuerpo y, sobre todo, que al abortar cierra la conexión de verdad
 * (la fuga que tumbó el panel era justo no cerrarla).
 */
const dir = mkdtempSync(join(tmpdir(), "gp-dock-"));
const socketPath = join(dir, "d.sock");
process.env.DOCKER_SOCKET = socketPath;

let server: Server;
const clients: { socket: Socket; closed: boolean; request: string }[] = [];

function chunk(text: string): string {
  return `${Buffer.byteLength(text).toString(16)}\r\n${text}\r\n`;
}

function statsLine(totalUsage: number, usageBytes: number): string {
  return `${JSON.stringify({
    cpu_stats: {
      cpu_usage: { total_usage: totalUsage },
      system_cpu_usage: 1000,
      online_cpus: 4,
    },
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 900 },
    memory_stats: { usage: usageBytes, limit: 4096 * 1024 * 1024, stats: { cache: 0 } },
  })}\n`;
}

beforeAll(async () => {
  server = createServer((socket) => {
    const entry = { socket, closed: false, request: "" };
    clients.push(entry);
    socket.on("close", () => {
      entry.closed = true;
    });
    socket.once("data", (data) => {
      entry.request = data.toString("utf8");
      socket.write(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n",
      );
      // Primera línea entera, segunda partida en dos trozos.
      const second = statsLine(300, 1024 * 1024 * 1024);
      socket.write(chunk(statsLine(200, 512 * 1024 * 1024)));
      socket.write(chunk(second.slice(0, 20)));
      socket.write(chunk(second.slice(20)));
      const timer = setInterval(() => {
        if (socket.destroyed) return clearInterval(timer);
        socket.write(chunk(statsLine(200, 512 * 1024 * 1024)));
      }, 5);
      socket.on("close", () => clearInterval(timer));
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, r));
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("timeout esperando condición");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("streamContainerStats (socket crudo)", () => {
  it("pide el stream al contenedor correcto y decodifica las líneas, aunque vengan partidas", async () => {
    const { streamContainerStats } = await import("./docker");
    const ac = new AbortController();
    const got = [];
    for await (const stats of streamContainerStats("minecraft", ac.signal)) {
      got.push(stats);
      if (got.length === 2) break;
    }
    const client = clients.at(-1);
    expect(client?.request).toContain(
      "GET /containers/game-panel-minecraft/stats?stream=1 HTTP/1.1",
    );
    expect(got[0]).toEqual({ cpuPercent: 400, cpuCores: 4, memUsageMB: 512, memLimitMB: 4096 });
    expect(got[1]).toEqual({ cpuPercent: 800, cpuCores: 4, memUsageMB: 1024, memLimitMB: 4096 });
    // Salir del bucle con break también tiene que soltar la conexión.
    await waitFor(() => client?.closed === true);
  });

  it("al abortar cierra la conexión con Docker y el generador termina", async () => {
    const { streamContainerStats } = await import("./docker");
    const ac = new AbortController();
    const gen = streamContainerStats("valheim", ac.signal);
    const first = await gen.next();
    expect(first.done).toBe(false);

    const client = clients.at(-1);
    expect(client?.closed).toBe(false);
    ac.abort();

    await waitFor(() => client?.closed === true);
    // Tras el abort, la siguiente lectura no se queda colgada.
    const rest = await Promise.race([
      gen.next(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("colgado")), 1000)),
    ]);
    expect(rest.done).toBe(true);
  });

  it("si Docker corta la conexión, el generador termina solo", async () => {
    const { streamContainerStats } = await import("./docker");
    const ac = new AbortController();
    const gen = streamContainerStats("reels", ac.signal);
    await gen.next();
    const client = clients.at(-1);
    client?.socket.end();
    const rest = await Promise.race([
      (async () => {
        for await (const _ of gen) {
          /* drenar hasta que cierre */
        }
        return { done: true };
      })(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("colgado")), 1000)),
    ]);
    expect(rest.done).toBe(true);
  });
});
