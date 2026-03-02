import { vi } from "vitest";

export const mockContainer = {
  inspect: vi.fn().mockResolvedValue({
    State: { Running: true, StartedAt: "2026-01-01T00:00:00Z", Health: null },
    Config: { Tty: false },
    RestartCount: 0,
  }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  restart: vi.fn().mockResolvedValue(undefined),
  stats: vi.fn().mockResolvedValue({
    memory_stats: { usage: 512 * 1024 * 1024, limit: 4096 * 1024 * 1024, stats: { cache: 0 } },
    cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000, online_cpus: 4 },
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 900 },
  }),
  logs: vi.fn().mockResolvedValue(Buffer.from("")),
};

export const mockDocker = {
  getContainer: vi.fn().mockReturnValue(mockContainer),
  listContainers: vi.fn().mockResolvedValue([]),
  createContainer: vi.fn().mockResolvedValue(mockContainer),
  pull: vi.fn((_image: string, cb: (err: Error | null, stream: unknown) => void) => {
    cb(null, { on: vi.fn(), pipe: vi.fn() });
  }),
  modem: {
    followProgress: vi.fn((_stream: unknown, cb: (err: Error | null) => void) => {
      cb(null);
    }),
  },
};

export default vi.fn().mockImplementation(() => mockDocker);
