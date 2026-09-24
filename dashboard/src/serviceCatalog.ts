/**
 * Catálogo único de los servicios always-on del compose: nombre bonito,
 * descripción, dominios públicos y si tiene sentido reiniciarlo desde aquí.
 * Todo lo que la interfaz necesita saber de un servicio vive en esta lista;
 * añadir un proyecto nuevo (el próximo tras Koff) es una entrada más aquí,
 * nada que tocar en Home.tsx ni en Status.tsx.
 */

export type ServiceGroup = "sitios" | "infra";

export type ServiceDomain = {
  /** Texto a mostrar. Para nginx es "todos los dominios": no es un enlace. */
  label: string;
  url?: string;
};

export type ServiceMeta = {
  /** Coincide con el nombre del servicio en docker-compose.yml. */
  id: string;
  name: string;
  description: string;
  domains: ServiceDomain[];
  group: ServiceGroup;
  /**
   * Si reiniciarlo tiene sentido desde el panel. nginx y dashboard sirven el
   * propio panel: reiniciarlos cortaría la sesión de quien lo pulsa.
   */
  restartable: boolean;
};

export const SERVICE_CATALOG: ServiceMeta[] = [
  // --- Sitios: proyectos con dominio propio ---
  {
    id: "chatpapol",
    name: "ChatPapol",
    description: "Chat propio al estilo Discord: texto, voz y vídeo entre amigos.",
    domains: [{ label: "chat.aypapol.com", url: "https://chat.aypapol.com" }],
    group: "sitios",
    restartable: true,
  },
  {
    id: "livekit",
    name: "LiveKit (voz y vídeo)",
    description: "SFU que sostiene las llamadas de voz y vídeo de ChatPapol.",
    domains: [{ label: "livekit.aypapol.com", url: "https://livekit.aypapol.com" }],
    group: "sitios",
    restartable: true,
  },
  {
    id: "filebrowser",
    name: "Filebrowser (Rubas)",
    description: "Panel para que Rubas suba y gestione sus sitios estáticos.",
    domains: [{ label: "rubas.aypapol.com/admin/", url: "https://rubas.aypapol.com/admin/" }],
    group: "sitios",
    restartable: true,
  },
  {
    id: "koff",
    name: "Koff",
    description: "Web de la cafetería: landing, tarjeta de lealtad y admin de tickets.",
    domains: [
      { label: "coffeekoff.com", url: "https://coffeekoff.com" },
      { label: "api.coffeekoff.com", url: "https://api.coffeekoff.com" },
      { label: "admin.coffeekoff.com", url: "https://admin.coffeekoff.com" },
    ],
    group: "sitios",
    restartable: true,
  },
  // --- Infraestructura del panel: lo que sostiene todo lo anterior ---
  {
    id: "nginx",
    name: "Proxy inverso",
    description: "Reparte cada dominio al contenedor que le corresponde.",
    domains: [{ label: "todos los dominios" }],
    group: "infra",
    restartable: false,
  },
  {
    id: "backend",
    name: "API del panel",
    description: "Gestiona los servidores de juego, los usuarios y el resto de servicios.",
    domains: [{ label: "game.aypapol.com", url: "https://game.aypapol.com" }],
    group: "infra",
    restartable: true,
  },
  {
    id: "dashboard",
    name: "Panel web",
    description: "Esta misma interfaz.",
    domains: [{ label: "game.aypapol.com", url: "https://game.aypapol.com" }],
    group: "infra",
    restartable: false,
  },
  {
    id: "bot",
    name: "Bot de Discord",
    description: "Comandos y notificaciones del panel en Discord.",
    domains: [{ label: "sin dominio" }],
    group: "infra",
    restartable: true,
  },
];
