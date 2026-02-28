// Pure data definitions for Minecraft server configuration (itzg/minecraft-server)

export const SECTIONS = [
  "Server Type",
  "World",
  "Gameplay",
  "Network",
  "Advanced",
] as const;

export type Section = (typeof SECTIONS)[number];

export type FieldType = "select" | "toggle" | "number" | "text" | "memory";

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
};

export const MINECRAFT_FIELDS: MinecraftField[] = [
  // ── Server Type ──
  {
    key: "TYPE",
    label: "Server Type",
    type: "select",
    description: "The Minecraft server software to use",
    section: "Server Type",
    default: "VANILLA",
    modpackCompatible: false,
    options: [
      { value: "VANILLA", label: "Vanilla", description: "Official Mojang server" },
      { value: "PAPER", label: "Paper", description: "High-performance Spigot fork" },
      { value: "SPIGOT", label: "Spigot", description: "Modified CraftBukkit with optimizations" },
      { value: "FABRIC", label: "Fabric", description: "Lightweight modding framework" },
      { value: "FORGE", label: "Forge", description: "Classic modding platform" },
      { value: "NEOFORGE", label: "NeoForge", description: "Community fork of Forge" },
      { value: "QUILT", label: "Quilt", description: "Fork of Fabric with extra features" },
      { value: "PURPUR", label: "Purpur", description: "Paper fork with extra gameplay tweaks" },
      { value: "FOLIA", label: "Folia", description: "Paper fork with regionized multithreading" },
    ],
  },
  {
    key: "VERSION",
    label: "Minecraft Version",
    type: "text",
    description: "e.g. 1.21.4, LATEST, or SNAPSHOT",
    section: "Server Type",
    default: "LATEST",
    modpackCompatible: true,
  },
  {
    key: "MEMORY",
    label: "Memory",
    type: "memory",
    description: "RAM allocated to the server JVM",
    section: "Server Type",
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
    label: "World Type",
    type: "select",
    description: "The type of world generation",
    section: "World",
    default: "DEFAULT",
    modpackCompatible: false,
    options: [
      { value: "DEFAULT", label: "Default" },
      { value: "FLAT", label: "Flat" },
      { value: "LARGEBIOMES", label: "Large Biomes" },
      { value: "AMPLIFIED", label: "Amplified" },
    ],
  },
  {
    key: "SEED",
    label: "World Seed",
    type: "text",
    description: "Seed for world generation (leave blank for random)",
    section: "World",
    default: "",
    modpackCompatible: false,
  },

  // ── Gameplay ──
  {
    key: "DIFFICULTY",
    label: "Difficulty",
    type: "select",
    description: "Game difficulty level",
    section: "Gameplay",
    default: "easy",
    modpackCompatible: true,
    options: [
      { value: "peaceful", label: "Peaceful" },
      { value: "easy", label: "Easy" },
      { value: "normal", label: "Normal" },
      { value: "hard", label: "Hard" },
    ],
  },
  {
    key: "MODE",
    label: "Game Mode",
    type: "select",
    description: "Default game mode for new players",
    section: "Gameplay",
    default: "survival",
    modpackCompatible: true,
    options: [
      { value: "survival", label: "Survival" },
      { value: "creative", label: "Creative" },
      { value: "adventure", label: "Adventure" },
      { value: "spectator", label: "Spectator" },
    ],
  },
  {
    key: "HARDCORE",
    label: "Hardcore",
    type: "toggle",
    description: "One life only — world deleted on death",
    section: "Gameplay",
    default: "FALSE",
    modpackCompatible: true,
  },
  {
    key: "PVP",
    label: "PvP",
    type: "toggle",
    description: "Allow player vs player combat",
    section: "Gameplay",
    default: "TRUE",
    modpackCompatible: true,
  },
  {
    key: "ALLOW_FLIGHT",
    label: "Allow Flight",
    type: "toggle",
    description: "Allow players to fly in survival mode",
    section: "Gameplay",
    default: "FALSE",
    modpackCompatible: true,
  },

  // ── Network ──
  {
    key: "MAX_PLAYERS",
    label: "Max Players",
    type: "number",
    description: "Maximum concurrent players",
    section: "Network",
    default: "20",
    modpackCompatible: true,
  },
  {
    key: "MOTD",
    label: "Server Message (MOTD)",
    type: "text",
    description: "Shown in the server list",
    section: "Network",
    default: "A Minecraft Server",
    modpackCompatible: true,
  },
  {
    key: "ONLINE_MODE",
    label: "Online Mode",
    type: "toggle",
    description: "Authenticate players with Mojang (disable for cracked clients)",
    section: "Network",
    default: "TRUE",
    modpackCompatible: true,
  },
  {
    key: "VIEW_DISTANCE",
    label: "View Distance",
    type: "number",
    description: "Render distance in chunks (3-32)",
    section: "Network",
    default: "10",
    modpackCompatible: true,
  },

  // ── Advanced ──
  {
    key: "ENABLE_COMMAND_BLOCK",
    label: "Command Blocks",
    type: "toggle",
    description: "Allow command blocks in the world",
    section: "Advanced",
    default: "FALSE",
    modpackCompatible: true,
  },
  {
    key: "SPAWN_PROTECTION",
    label: "Spawn Protection",
    type: "number",
    description: "Radius around spawn where only ops can build (0 = off)",
    section: "Advanced",
    default: "16",
    modpackCompatible: true,
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
        label: "Modpack Slug or URL",
        type: "text",
        placeholder: "e.g. cobblemon or https://modrinth.com/modpack/cobblemon",
        description: "The Modrinth project slug or full URL",
      },
    ],
  },
  {
    id: "curseforge",
    label: "CurseForge",
    typeValue: "AUTO_CURSEFORGE",
    fields: [
      {
        key: "CF_API_KEY",
        label: "CurseForge API Key",
        type: "password",
        placeholder: "$2a$...",
        description: "Get one at console.curseforge.com",
      },
      {
        key: "CF_SLUG",
        label: "Modpack Slug",
        type: "text",
        placeholder: "e.g. all-the-mods-10",
        description: "The CurseForge project slug",
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
        label: "Modpack ID",
        type: "text",
        placeholder: "e.g. 35",
        description: "Numeric modpack ID from the FTB app",
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
  return MODPACK_PLATFORMS.flatMap((p) => [
    ...p.fields.map((f) => f.key),
  ]);
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
