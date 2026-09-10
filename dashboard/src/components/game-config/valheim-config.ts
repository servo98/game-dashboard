/**
 * Configuración de Valheim (imagen `lloesche/valheim-server`).
 *
 * Valheim no tiene un config file propio: todo se controla con variables de
 * entorno, salvo los *world modifiers*, que van dentro de `SERVER_ARGS` como
 * argumentos de línea de comandos:
 *
 *     -preset casual -modifier raids less -setkey nomap
 *
 * El orden importa: `-preset` pisa los modificadores anteriores, así que
 * siempre lo escribimos primero.
 */

export const VALHEIM_SECTIONS = [
  "Servidor",
  "Backups",
  "Actualizaciones",
  "Mods",
  "Sistema",
] as const;

export type ValheimSection = (typeof VALHEIM_SECTIONS)[number];

export type ValheimFieldType = "text" | "password" | "toggle" | "number" | "slider" | "select";

export type ValheimField = {
  key: string;
  label: string;
  type: ValheimFieldType;
  description: string;
  section: ValheimSection;
  default: string;
  placeholder?: string;
  options?: { value: string; label: string; description?: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export const VALHEIM_FIELDS: ValheimField[] = [
  // ── Servidor ──
  {
    key: "SERVER_NAME",
    label: "Nombre del servidor",
    type: "text",
    description: "Como aparece en el navegador de servidores",
    section: "Servidor",
    default: "My Server",
  },
  {
    key: "WORLD_NAME",
    label: "Mundo",
    type: "text",
    description: "Nombre del mundo dentro de worlds_local",
    section: "Servidor",
    default: "Dedicated",
  },
  {
    key: "SERVER_PASS",
    label: "Contraseña",
    type: "password",
    description: "Mínimo 5 caracteres, y no puede estar dentro del nombre del mundo",
    section: "Servidor",
    default: "",
  },
  {
    key: "SERVER_PUBLIC",
    label: "Servidor público",
    type: "toggle",
    description: "Aparece en la lista pública de servidores",
    section: "Servidor",
    default: "true",
  },
  {
    key: "CROSSPLAY",
    label: "Crossplay",
    type: "toggle",
    description: "Permite entrar a jugadores que no vienen de Steam (Xbox/Game Pass)",
    section: "Servidor",
    default: "false",
  },

  // ── Backups ──
  {
    key: "BACKUPS",
    label: "Backups automáticos",
    type: "toggle",
    description: "Copia periódica del mundo",
    section: "Backups",
    default: "true",
  },
  {
    key: "BACKUPS_CRON",
    label: "Frecuencia (cron)",
    type: "text",
    description: "Expresión cron. Por defecto cada hora en el minuto 5",
    section: "Backups",
    default: "5 * * * *",
    placeholder: "5 * * * *",
  },
  {
    key: "BACKUPS_MAX_AGE",
    label: "Antigüedad máxima",
    type: "slider",
    description: "Se borran los backups más viejos que esto",
    section: "Backups",
    default: "3",
    min: 1,
    max: 30,
    step: 1,
    unit: "días",
  },
  {
    key: "BACKUPS_MAX_COUNT",
    label: "Máximo de backups",
    type: "slider",
    description: "0 = sin límite de cantidad",
    section: "Backups",
    default: "0",
    min: 0,
    max: 50,
    step: 1,
    unit: "copias",
  },
  {
    key: "BACKUPS_IF_IDLE",
    label: "Backup con el server vacío",
    type: "toggle",
    description: "Hace backup aunque no haya nadie conectado",
    section: "Backups",
    default: "true",
  },
  {
    key: "BACKUPS_ZIP",
    label: "Comprimir en zip",
    type: "toggle",
    description: "Guarda los backups comprimidos",
    section: "Backups",
    default: "true",
  },

  // ── Actualizaciones ──
  {
    key: "UPDATE_CRON",
    label: "Buscar updates (cron)",
    type: "text",
    description: "Cada cuánto comprueba si hay versión nueva de Valheim",
    section: "Actualizaciones",
    default: "*/15 * * * *",
    placeholder: "*/15 * * * *",
  },
  {
    key: "UPDATE_IF_IDLE",
    label: "Actualizar sólo si está vacío",
    type: "toggle",
    description: "Evita cortar la partida a quien esté dentro",
    section: "Actualizaciones",
    default: "true",
  },
  {
    key: "RESTART_CRON",
    label: "Reinicio programado (cron)",
    type: "text",
    description: "Reinicio periódico del server. Vacío para desactivarlo",
    section: "Actualizaciones",
    default: "10 5 * * *",
    placeholder: "10 5 * * *",
  },
  {
    key: "RESTART_IF_IDLE",
    label: "Reiniciar sólo si está vacío",
    type: "toggle",
    description: "No reinicia si hay jugadores conectados",
    section: "Actualizaciones",
    default: "true",
  },
  {
    key: "PUBLIC_TEST",
    label: "Rama Public Test",
    type: "toggle",
    description: "Corre la beta pública en vez de la versión estable",
    section: "Actualizaciones",
    default: "false",
  },

  // ── Mods ──
  {
    key: "BEPINEX",
    label: "BepInEx",
    type: "toggle",
    description: "Instala el framework de mods. Los .cfg aparecerán en Archivos de config",
    section: "Mods",
    default: "false",
  },
  {
    key: "VALHEIM_PLUS",
    label: "ValheimPlus",
    type: "toggle",
    description: "Instala ValheimPlus (incompatible con BepInEx a secas)",
    section: "Mods",
    default: "false",
  },
  {
    key: "VALHEIM_PLUS_RELEASE",
    label: "Versión de ValheimPlus",
    type: "text",
    description: "`latest` o un tag concreto del repo",
    section: "Mods",
    default: "latest",
    placeholder: "latest",
  },

  // ── Sistema ──
  {
    key: "TZ",
    label: "Zona horaria",
    type: "text",
    description: "Afecta a los cron y a los timestamps de los backups",
    section: "Sistema",
    default: "Etc/UTC",
    placeholder: "America/Mexico_City",
  },
  {
    key: "PERMISSIONS_UMASK",
    label: "umask",
    type: "text",
    description: "Permisos con los que el server crea ficheros",
    section: "Sistema",
    default: "022",
    placeholder: "022",
  },
];

/** Variables que ya tienen su control en el formulario guiado. */
export function getValheimKnownKeys(): Set<string> {
  const keys = new Set(VALHEIM_FIELDS.map((f) => f.key));
  keys.add("SERVER_ARGS");
  return keys;
}

/**
 * Variables que, si están puestas, pisan lo que haya en los ficheros de lista.
 * Lo avisamos en la UI para que no parezca que el editor no guarda.
 */
export const LIST_OVERRIDE_ENV: Record<string, string> = {
  "adminlist.txt": "ADMINLIST_IDS",
  "bannedlist.txt": "BANNEDLIST_IDS",
  "permittedlist.txt": "PERMITTEDLIST_IDS",
};

// ── World modifiers (SERVER_ARGS) ──

export const VALHEIM_PRESETS = [
  { value: "", label: "Sin preset", description: "Respeta los modificadores de abajo" },
  { value: "normal", label: "Normal" },
  { value: "casual", label: "Casual" },
  { value: "easy", label: "Fácil" },
  { value: "hard", label: "Difícil" },
  { value: "hardcore", label: "Hardcore" },
  { value: "immersive", label: "Inmersivo" },
  { value: "hammer", label: "Hammer (modo construcción)" },
];

export type ValheimModifier = {
  key: string;
  label: string;
  description: string;
  /** Ordenados de más fácil a más difícil; "" es el valor normal del juego */
  values: { value: string; label: string }[];
};

export const VALHEIM_MODIFIERS: ValheimModifier[] = [
  {
    key: "combat",
    label: "Combate",
    description: "Daño que hacen y aguantan los enemigos",
    values: [
      { value: "veryeasy", label: "Muy fácil" },
      { value: "easy", label: "Fácil" },
      { value: "", label: "Normal" },
      { value: "hard", label: "Difícil" },
      { value: "veryhard", label: "Muy difícil" },
    ],
  },
  {
    key: "deathpenalty",
    label: "Penalización por muerte",
    description: "Qué pierdes al morir",
    values: [
      { value: "casual", label: "Casual" },
      { value: "veryeasy", label: "Muy suave" },
      { value: "easy", label: "Suave" },
      { value: "", label: "Normal" },
      { value: "hard", label: "Dura" },
      { value: "hardcore", label: "Hardcore" },
    ],
  },
  {
    key: "resources",
    label: "Recursos",
    description: "Cuánto sueltan los recursos del mundo",
    values: [
      { value: "muchless", label: "Muchos menos" },
      { value: "less", label: "Menos" },
      { value: "", label: "Normal" },
      { value: "more", label: "Más" },
      { value: "muchmore", label: "Muchos más" },
      { value: "most", label: "Máximo" },
    ],
  },
  {
    key: "raids",
    label: "Raids",
    description: "Frecuencia de los ataques a la base",
    values: [
      { value: "none", label: "Ninguna" },
      { value: "muchless", label: "Muchas menos" },
      { value: "less", label: "Menos" },
      { value: "", label: "Normal" },
      { value: "more", label: "Más" },
      { value: "muchmore", label: "Muchas más" },
    ],
  },
  {
    key: "portals",
    label: "Portales",
    description:
      "Qué se puede llevar por un portal. Normal es la regla de siempre: minerales y lingotes no pasan",
    values: [
      { value: "casual", label: "Todo pasa" },
      { value: "", label: "Normal" },
      { value: "veryhard", label: "Nada pasa" },
    ],
  },
];

export type ValheimKeyToggle = { key: string; label: string; description: string };

export const VALHEIM_KEY_TOGGLES: ValheimKeyToggle[] = [
  {
    key: "nobuildcost",
    label: "Construcción gratis",
    description: "Las piezas de construcción no gastan materiales",
  },
  {
    key: "playerevents",
    label: "Eventos por jugador",
    description: "Los raids escalan con el progreso individual, no con los jefes del mundo",
  },
  {
    key: "passivemobs",
    label: "Enemigos pasivos",
    description: "Sólo atacan si les atacas primero",
  },
  {
    key: "nomap",
    label: "Sin mapa",
    description: "Desactiva mapa y minimapa para todo el mundo",
  },
];

export type WorldModifiers = {
  preset: string;
  /** clave -> valor; "" significa el valor normal (no se escribe) */
  modifiers: Record<string, string>;
  keys: string[];
  /** Argumentos que no reconocemos: se conservan tal cual */
  extraArgs: string[];
};

const MODIFIER_KEYS = new Set(VALHEIM_MODIFIERS.map((m) => m.key));
const TOGGLE_KEYS = new Set(VALHEIM_KEY_TOGGLES.map((k) => k.key));
const PRESET_VALUES = new Set(VALHEIM_PRESETS.map((p) => p.value).filter(Boolean));

/** Trocea una línea de argumentos respetando las comillas dobles. */
function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return tokens;
}

function quoteIfNeeded(token: string): string {
  return /\s/.test(token) ? `"${token}"` : token;
}

export function parseServerArgs(raw: string): WorldModifiers {
  const tokens = tokenize(raw ?? "");
  const result: WorldModifiers = { preset: "", modifiers: {}, keys: [], extraArgs: [] };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "-preset" && i + 1 < tokens.length) {
      const value = tokens[++i].toLowerCase();
      if (PRESET_VALUES.has(value)) result.preset = value;
      else result.extraArgs.push("-preset", tokens[i]);
      continue;
    }

    if (token === "-modifier" && i + 2 < tokens.length) {
      const key = tokens[i + 1].toLowerCase();
      const value = tokens[i + 2].toLowerCase();
      if (MODIFIER_KEYS.has(key)) {
        result.modifiers[key] = value;
        i += 2;
      } else {
        result.extraArgs.push(token);
      }
      continue;
    }

    if (token === "-setkey" && i + 1 < tokens.length) {
      const key = tokens[i + 1].toLowerCase();
      if (TOGGLE_KEYS.has(key)) {
        if (!result.keys.includes(key)) result.keys.push(key);
        i += 1;
      } else {
        result.extraArgs.push(token);
      }
      continue;
    }

    result.extraArgs.push(token);
  }

  return result;
}

export function buildServerArgs(state: WorldModifiers): string {
  const parts: string[] = [];

  // El preset pisa los modificadores previos, así que va el primero.
  if (state.preset) parts.push("-preset", state.preset);

  for (const modifier of VALHEIM_MODIFIERS) {
    const value = state.modifiers[modifier.key];
    if (value) parts.push("-modifier", modifier.key, value);
  }

  for (const key of VALHEIM_KEY_TOGGLES) {
    if (state.keys.includes(key.key)) parts.push("-setkey", key.key);
  }

  parts.push(...state.extraArgs);

  return parts.map(quoteIfNeeded).join(" ");
}

// ── Booleanos en variables de entorno ──

const TRUTHY = new Set(["1", "true", "yes", "on", "y"]);
const NUMERIC_BOOL = new Set(["0", "1"]);

export function isEnvTrue(value: string | undefined): boolean {
  return TRUTHY.has((value ?? "").trim().toLowerCase());
}

/**
 * Escribe un booleano respetando el estilo que ya tenía la variable: si estaba
 * como `1`/`0` se queda así, y si no usamos `true`/`false`.
 */
export function writeEnvBool(current: string | undefined, on: boolean): string {
  if (current !== undefined && NUMERIC_BOOL.has(current.trim())) return on ? "1" : "0";
  return on ? "true" : "false";
}
