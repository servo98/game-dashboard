// Pure data definitions for Minecraft server configuration (itzg/minecraft-server)

export const SECTIONS = ["Tipo de servidor", "Mundo", "Juego", "Red", "Avanzado"] as const;

export type Section = (typeof SECTIONS)[number];

export type FieldType = "select" | "toggle" | "number" | "slider" | "text" | "memory";

export type FieldOption = {
  value: string;
  label: string;
  description?: string;
};

export type MinecraftField = {
  key: string;
  label: string;
  type: FieldType;
  description: string;
  section: Section;
  default: string;
  options?: FieldOption[];
  modpackCompatible: boolean;
  /** Sólo para `slider` */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

// Maps MC version ranges to the required Java image tag
export const JAVA_TAG_OPTIONS = [
  { value: "java21", label: "Java 21", description: "MC 1.20.5+" },
  { value: "java17", label: "Java 17", description: "MC 1.18 – 1.20.4" },
  { value: "java8", label: "Java 8", description: "MC 1.16.5 y anteriores" },
] as const;

/** Given a MC version string, return the best java image tag */
export function javaTagForVersion(version: string): string {
  if (version === "LATEST" || version === "SNAPSHOT") return "java21";
  const parts = version.split(".").map(Number);
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (minor >= 21 || (minor === 20 && patch >= 5)) return "java21";
  if (minor >= 18) return "java17";
  return "java8";
}

export const MINECRAFT_FIELDS: MinecraftField[] = [
  // ── Server Type ──
  {
    key: "TYPE",
    label: "Tipo de servidor",
    type: "select",
    description: "Qué software de servidor usar",
    section: "Tipo de servidor",
    default: "VANILLA",
    modpackCompatible: false,
    options: [
      { value: "VANILLA", label: "Vanilla", description: "Servidor oficial de Mojang" },
      { value: "PAPER", label: "Paper", description: "Fork de Spigot centrado en rendimiento" },
      {
        value: "SPIGOT",
        label: "Spigot",
        description: "CraftBukkit modificado con optimizaciones",
      },
      { value: "FABRIC", label: "Fabric", description: "Framework de mods ligero" },
      { value: "FORGE", label: "Forge", description: "Plataforma de mods clásica" },
      { value: "NEOFORGE", label: "NeoForge", description: "Fork comunitario de Forge" },
      { value: "QUILT", label: "Quilt", description: "Fork de Fabric con más funciones" },
      { value: "PURPUR", label: "Purpur", description: "Fork de Paper con ajustes de juego extra" },
      { value: "FOLIA", label: "Folia", description: "Fork de Paper con multihilo por regiones" },
    ],
  },
  {
    key: "VERSION",
    label: "Versión de Minecraft",
    type: "select",
    description: "Versión de Minecraft que se ejecuta",
    section: "Tipo de servidor",
    default: "LATEST",
    modpackCompatible: false,
    options: [
      { value: "LATEST", label: "Última", description: "Siempre la última versión estable" },
      { value: "1.21.5", label: "1.21.5" },
      { value: "1.21.4", label: "1.21.4" },
      { value: "1.21.1", label: "1.21.1" },
      { value: "1.20.6", label: "1.20.6" },
      { value: "1.20.4", label: "1.20.4" },
      { value: "1.20.1", label: "1.20.1", description: "Versión popular para mods" },
      { value: "1.19.4", label: "1.19.4" },
      { value: "1.18.2", label: "1.18.2" },
      { value: "1.16.5", label: "1.16.5", description: "Versión antigua para mods" },
      { value: "1.12.2", label: "1.12.2", description: "Versión clásica para mods" },
    ],
  },
  {
    key: "MEMORY",
    label: "Memoria",
    type: "memory",
    description: "RAM que se reserva a la JVM del servidor",
    section: "Tipo de servidor",
    default: "2G",
    modpackCompatible: true,
    options: [
      { value: "1G", label: "1 GB" },
      { value: "2G", label: "2 GB" },
      { value: "3G", label: "3 GB" },
      { value: "4G", label: "4 GB" },
      { value: "6G", label: "6 GB" },
      { value: "8G", label: "8 GB" },
      { value: "10G", label: "10 GB" },
      { value: "12G", label: "12 GB" },
    ],
  },

  // ── World ──
  {
    key: "LEVEL_TYPE",
    label: "Tipo de mundo",
    type: "select",
    description: "Cómo se genera el mundo",
    section: "Mundo",
    default: "DEFAULT",
    modpackCompatible: false,
    options: [
      { value: "DEFAULT", label: "Por defecto" },
      { value: "FLAT", label: "Plano" },
      { value: "LARGEBIOMES", label: "Biomas grandes" },
      { value: "AMPLIFIED", label: "Amplificado" },
    ],
  },
  {
    key: "SEED",
    label: "Semilla del mundo",
    type: "text",
    description: "Semilla de generación. En blanco, aleatoria.",
    section: "Mundo",
    default: "",
    modpackCompatible: false,
  },

  // ── Gameplay ──
  {
    key: "DIFFICULTY",
    label: "Dificultad",
    type: "select",
    description: "Nivel de dificultad",
    section: "Juego",
    default: "normal",
    modpackCompatible: true,
    options: [
      { value: "peaceful", label: "Pacífico" },
      { value: "easy", label: "Fácil" },
      { value: "normal", label: "Normal" },
      { value: "hard", label: "Difícil" },
    ],
  },
  {
    key: "MODE",
    label: "Modo de juego",
    type: "select",
    description: "Modo con el que entran los jugadores nuevos",
    section: "Juego",
    default: "survival",
    modpackCompatible: true,
    options: [
      { value: "survival", label: "Supervivencia" },
      { value: "creative", label: "Creativo" },
      { value: "adventure", label: "Aventura" },
      { value: "spectator", label: "Espectador" },
    ],
  },
  {
    key: "HARDCORE",
    label: "Hardcore",
    type: "toggle",
    description: "Una sola vida: al morir se borra el mundo",
    section: "Juego",
    default: "FALSE",
    modpackCompatible: true,
  },
  {
    key: "PVP",
    label: "PvP",
    type: "toggle",
    description: "Permite el combate entre jugadores",
    section: "Juego",
    default: "TRUE",
    modpackCompatible: true,
  },
  {
    key: "ALLOW_FLIGHT",
    label: "Permitir volar",
    type: "toggle",
    description: "Permite volar en modo supervivencia",
    section: "Juego",
    default: "FALSE",
    modpackCompatible: true,
  },

  // ── Network ──
  {
    key: "MAX_PLAYERS",
    label: "Jugadores máximos",
    type: "slider",
    description: "Jugadores simultáneos como máximo",
    section: "Red",
    default: "20",
    modpackCompatible: true,
    min: 1,
    max: 100,
    step: 1,
    unit: "jugadores",
  },
  {
    key: "MOTD",
    label: "Mensaje del servidor (MOTD)",
    type: "text",
    description: "Se ve en la lista de servidores",
    section: "Red",
    default: "A Minecraft Server",
    modpackCompatible: true,
  },
  {
    key: "ONLINE_MODE",
    label: "Modo online",
    type: "toggle",
    description: "Verifica las cuentas contra Mojang. Desactívalo para clientes pirata.",
    section: "Red",
    default: "TRUE",
    modpackCompatible: true,
  },
  {
    key: "VIEW_DISTANCE",
    label: "Distancia de dibujado",
    type: "slider",
    description: "Distancia de dibujado en chunks. Subirla cuesta RAM y CPU.",
    section: "Red",
    default: "10",
    modpackCompatible: true,
    min: 3,
    max: 32,
    step: 1,
    unit: "chunks",
  },

  // ── Advanced ──
  {
    key: "ENABLE_COMMAND_BLOCK",
    label: "Bloques de comandos",
    type: "toggle",
    description: "Permite bloques de comandos en el mundo",
    section: "Avanzado",
    default: "FALSE",
    modpackCompatible: true,
  },
  {
    key: "SPAWN_PROTECTION",
    label: "Protección del spawn",
    type: "slider",
    description: "Radio alrededor del spawn donde solo construyen los ops. A 0 se desactiva.",
    section: "Avanzado",
    default: "16",
    modpackCompatible: true,
    min: 0,
    max: 64,
    step: 1,
    unit: "bloques",
  },
];

// ── Modpack platforms ──

export type ModpackPlatform = {
  id: string;
  label: string;
  typeValue: string;
  fields: ModpackPlatformField[];
};

export type ModpackPlatformField = {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  description: string;
};

export const MODPACK_PLATFORMS: ModpackPlatform[] = [
  {
    id: "modrinth",
    label: "Modrinth",
    typeValue: "MODRINTH",
    fields: [
      {
        key: "MODRINTH_MODPACK",
        label: "Slug o URL del modpack",
        type: "text",
        placeholder: "e.g. cobblemon or https://modrinth.com/modpack/cobblemon",
        description: "El slug del proyecto en Modrinth, o su URL entera",
      },
    ],
  },
  {
    id: "curseforge",
    label: "CurseForge",
    typeValue: "AUTO_CURSEFORGE",
    fields: [
      {
        key: "CF_SLUG",
        label: "Slug del modpack",
        type: "text",
        placeholder: "e.g. all-the-mods-10",
        description: "El slug del proyecto en CurseForge",
      },
    ],
  },
  {
    id: "ftb",
    label: "FTB",
    typeValue: "FTBA",
    fields: [
      {
        key: "FTB_MODPACK_ID",
        label: "ID del modpack",
        type: "text",
        placeholder: "e.g. 35",
        description: "ID numérico del modpack en la app de FTB",
      },
    ],
  },
];

// ── Helper functions ──

const MODPACK_TYPE_VALUES = new Set(MODPACK_PLATFORMS.map((p) => p.typeValue));

/** Check if the current TYPE value indicates a modpack setup */
export function isModpackType(typeValue: string): boolean {
  return MODPACK_TYPE_VALUES.has(typeValue);
}

/** Find the modpack platform config matching a TYPE value */
export function getModpackPlatformByType(typeValue: string): ModpackPlatform | undefined {
  return MODPACK_PLATFORMS.find((p) => p.typeValue === typeValue);
}

/** Get all env var keys used by modpack platforms (for cleanup) */
export function getModpackEnvKeys(): string[] {
  return MODPACK_PLATFORMS.flatMap((p) => [...p.fields.map((f) => f.key)]);
}

/** All known Minecraft env var keys (fields + modpack keys + EULA) */
export function getAllKnownKeys(): Set<string> {
  const keys = new Set<string>();
  keys.add("EULA");
  for (const f of MINECRAFT_FIELDS) keys.add(f.key);
  for (const p of MODPACK_PLATFORMS) {
    for (const f of p.fields) keys.add(f.key);
  }
  return keys;
}
