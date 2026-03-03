/**
 * Sanitize strings from Minecraft server output.
 * Strips ANSI escape codes, control characters, and excess whitespace.
 */
export function sanitize(str: unknown): string {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/\u001b\[[0-9;]*m/g, "") // ANSI color codes
    .replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // Control chars (keep \t)
    .trim();
}

/** Sanitize every string in an array */
export function sanitizeArray(arr: unknown[]): string[] {
  return arr.map((v) => sanitize(v));
}

/** Deep-sanitize all string values in an object */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === "string") return sanitize(obj) as T;
  if (Array.isArray(obj)) return obj.map((v) => sanitizeObject(v)) as T;
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value);
    }
    return result as T;
  }
  return obj;
}
