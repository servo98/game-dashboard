/**
 * Parser genérico para los ficheros de config tipo INI que usan los servers y
 * sus mods: BepInEx (`.cfg`), ValheimPlus (`.cfg`), Forge (`.toml`) y
 * `server.properties`.
 *
 * La gracia es que esos formatos son auto-documentados: encima de cada clave
 * viene un bloque de comentarios con la descripción, el tipo, el valor por
 * defecto y los valores aceptados. Con eso podemos generar el formulario solo
 * —toggles, selects y sliders de verdad— sin conocer el mod de antemano.
 *
 * Ejemplo (BepInEx):
 *
 *     [Logging]
 *
 *     ## Enables showing a console for log output.
 *     # Setting type: Boolean
 *     # Default value: false
 *     Enabled = false
 *
 * Al guardar sólo reescribimos la línea del valor que cambió, así que los
 * comentarios y el orden del fichero se quedan intactos.
 */

export type CfgFieldKind = "toggle" | "select" | "slider" | "number" | "text";

export type CfgEntry = {
  /** `${section}::${key}` — identificador estable para el estado del form */
  id: string;
  section: string;
  key: string;
  /** Valor ya sin comillas (TOML) y sin espacios sobrantes */
  value: string;
  description: string;
  settingType?: string;
  defaultValue?: string;
  acceptableValues?: string[];
  min?: number;
  max?: number;
  /** Comilla original del valor, para restaurarla al escribir */
  quote: string;
  /** Índice de la línea `key = value` dentro de `lines` */
  lineIndex: number;
  /** Todo lo que va antes del valor en esa línea, incluido el `=` */
  prefix: string;
};

export type CfgSection = {
  name: string;
  entries: CfgEntry[];
};

export type ParsedCfg = {
  lines: string[];
  sections: CfgSection[];
  entryCount: number;
  eol: string;
  trailingNewline: boolean;
};

const SECTION_RE = /^\s*\[(.+?)\]\s*$/;
// La clave puede llevar espacios (BepInEx lo permite) pero nunca `:`, así
// evitamos tragarnos líneas de YAML que casualmente contengan un `=`.
const ENTRY_RE = /^(\s*)([A-Za-z0-9_.\-+][A-Za-z0-9_.\-+ ]*?)\s*=[ \t]*(.*)$/;

// BepInEx
const SETTING_TYPE_RE = /^#\s*Setting type:\s*(.+?)\s*$/;
const DEFAULT_VALUE_RE = /^#\s*Default value:\s*(.*?)\s*$/;
const ACCEPTABLE_VALUES_RE = /^#\s*Acceptable values:\s*(.+?)\s*$/;
const ACCEPTABLE_RANGE_RE = /^#\s*Acceptable value range:\s*From\s+(\S+)\s+to\s+(\S+)\s*$/;
// Forge / NeoForge
const FORGE_RANGE_RE = /^#\s*Range:\s*(?:\w+\s*)?(-?[\d.]+)\s*~\s*(-?[\d.]+)\s*$/;
const FORGE_ALLOWED_RE = /^#\s*Allowed Values:\s*(.+?)\s*$/;
const FORGE_DEFAULT_RE = /^#\s*Default:\s*(.*?)\s*$/;

const NUMERIC_TYPES = new Set([
  "byte",
  "sbyte",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "single",
  "double",
  "decimal",
]);

const INTEGER_TYPES = new Set([
  "byte",
  "sbyte",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
]);

function isBoolish(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "false";
}

function isNumericValue(value: string): boolean {
  const v = value.trim();
  return v !== "" && Number.isFinite(Number(v));
}

/** Quita las comillas de un valor TOML y devuelve cuál era */
function unquote(raw: string): { value: string; quote: string } {
  const v = raw.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return { value: v.slice(1, -1), quote: v[0] };
  }
  return { value: v, quote: "" };
}

type Pending = {
  description: string[];
  settingType?: string;
  defaultValue?: string;
  acceptableValues?: string[];
  min?: number;
  max?: number;
};

function emptyPending(): Pending {
  return { description: [] };
}

export function parseCfg(text: string): ParsedCfg {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = text.endsWith("\n");
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();

  const sections: CfgSection[] = [];
  const byName = new Map<string, CfgSection>();
  let current = "";
  let pending = emptyPending();
  let entryCount = 0;

  function sectionFor(name: string): CfgSection {
    let s = byName.get(name);
    if (!s) {
      s = { name, entries: [] };
      byName.set(name, s);
      sections.push(s);
    }
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      // Los bloques de metadatos van pegados a su clave: un hueco los corta.
      pending = emptyPending();
      continue;
    }

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      sectionFor(current);
      pending = emptyPending();
      continue;
    }

    const trimmed = line.trim();

    // Descripción: `##` en BepInEx, `;` en ValheimPlus
    if (trimmed.startsWith("##")) {
      pending.description.push(trimmed.slice(2).trim());
      continue;
    }
    if (trimmed.startsWith(";")) {
      pending.description.push(trimmed.slice(1).trim());
      continue;
    }

    if (trimmed.startsWith("#")) {
      const type = trimmed.match(SETTING_TYPE_RE);
      if (type) {
        pending.settingType = type[1];
        continue;
      }
      const def = trimmed.match(DEFAULT_VALUE_RE) ?? trimmed.match(FORGE_DEFAULT_RE);
      if (def) {
        pending.defaultValue = unquote(def[1]).value;
        continue;
      }
      const values = trimmed.match(ACCEPTABLE_VALUES_RE) ?? trimmed.match(FORGE_ALLOWED_RE);
      if (values) {
        pending.acceptableValues = values[1]
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        continue;
      }
      const range = trimmed.match(ACCEPTABLE_RANGE_RE) ?? trimmed.match(FORGE_RANGE_RE);
      if (range) {
        const min = Number(range[1]);
        const max = Number(range[2]);
        if (Number.isFinite(min) && Number.isFinite(max)) {
          pending.min = min;
          pending.max = max;
        }
        continue;
      }
      // Comentario suelto: vale como descripción.
      pending.description.push(trimmed.replace(/^#+\s?/, ""));
      continue;
    }

    const entryMatch = line.match(ENTRY_RE);
    if (!entryMatch) {
      pending = emptyPending();
      continue;
    }

    const [, indent, rawKey, rawValue] = entryMatch;
    const key = rawKey.trim();
    const { value, quote } = unquote(rawValue);
    const prefix = line.slice(0, line.length - rawValue.length);

    sectionFor(current).entries.push({
      id: `${current}::${key}`,
      section: current,
      key,
      value,
      description: pending.description.join(" ").trim(),
      settingType: pending.settingType,
      defaultValue: pending.defaultValue,
      acceptableValues: pending.acceptableValues,
      min: pending.min,
      max: pending.max,
      quote,
      lineIndex: i,
      prefix: prefix.length > 0 ? prefix : `${indent}${key} = `,
    });
    entryCount++;
    pending = emptyPending();
  }

  // Una sección vacía sólo estorba en el formulario.
  const nonEmpty = sections.filter((s) => s.entries.length > 0);
  return { lines, sections: nonEmpty, entryCount, eol, trailingNewline };
}

/**
 * Reescribe sólo las líneas cuyo valor cambió. Todo lo demás —comentarios,
 * orden, secciones vacías, saltos de línea— se queda exactamente igual.
 */
export function applyCfgChanges(parsed: ParsedCfg, changes: Record<string, string>): string {
  const lines = [...parsed.lines];

  for (const section of parsed.sections) {
    for (const entry of section.entries) {
      const next = changes[entry.id];
      if (next === undefined || next === entry.value) continue;
      lines[entry.lineIndex] = `${entry.prefix}${entry.quote}${next}${entry.quote}`;
    }
  }

  return lines.join(parsed.eol) + (parsed.trailingNewline ? parsed.eol : "");
}

/** Decide qué control pintar para una entrada, a partir de sus metadatos. */
export function fieldKind(entry: CfgEntry): CfgFieldKind {
  const type = (entry.settingType ?? "").toLowerCase();
  const hasValues = !!entry.acceptableValues && entry.acceptableValues.length > 1;

  if (type === "boolean" || (!entry.settingType && !hasValues && isBoolish(entry.value))) {
    return "toggle";
  }

  if (hasValues) {
    // Los enum de flags admiten varios valores separados por coma: ahí un
    // select se quedaría corto y rompería el valor actual.
    const multi = entry.value.includes(",");
    if (!multi && entry.acceptableValues!.length <= 30) return "select";
    return "text";
  }

  if (entry.min !== undefined && entry.max !== undefined && isNumericValue(entry.value)) {
    return "slider";
  }

  if (NUMERIC_TYPES.has(type) || (!entry.settingType && isNumericValue(entry.value))) {
    return "number";
  }

  return "text";
}

/** Paso razonable para el slider según el tipo y el rango. */
export function sliderStep(entry: CfgEntry): number {
  const type = (entry.settingType ?? "").toLowerCase();
  if (INTEGER_TYPES.has(type)) return 1;

  const span = (entry.max ?? 1) - (entry.min ?? 0);
  if (!Number.isFinite(span) || span <= 0) return 1;

  // Sin tipo declarado (ValheimPlus, properties): si el rango y el valor son
  // enteros, lo tratamos como entero.
  const looksInteger =
    !NUMERIC_TYPES.has(type) &&
    Number.isInteger(entry.min) &&
    Number.isInteger(entry.max) &&
    !entry.value.includes(".");
  if (looksInteger) return 1;

  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  return 1;
}

/** ¿Está el valor actual en su valor por defecto? */
export function isDefaultValue(entry: CfgEntry): boolean {
  if (entry.defaultValue === undefined) return false;
  return entry.value.trim().toLowerCase() === entry.defaultValue.trim().toLowerCase();
}
