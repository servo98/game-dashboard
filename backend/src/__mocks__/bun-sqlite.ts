// Minimal mock for bun:sqlite so tests can import modules that depend on db.ts
// without needing a real Bun runtime or SQLite database.

export class Database {
  exec() {}
  prepare() {
    return {
      get: () => undefined,
      all: () => [],
      run: () => {},
    };
  }
  query() {
    return this.prepare();
  }
}
