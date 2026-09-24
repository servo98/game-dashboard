/**
 * Servicios always-on del compose: el propio panel, el proxy y los sitios que
 * aloja. NO son partidas de juego (esas viven en containers aparte, sin esta
 * lista). Único sitio con esta lista — la comparten el healthcheck, la caché
 * de stats y las rutas de logs/stats/reinicio para no desincronizarse entre
 * ellos cuando se añade un servicio nuevo.
 */
export const COMPOSE_SERVICES = [
  "backend",
  "bot",
  "dashboard",
  "nginx",
  "chatpapol",
  "livekit",
  "filebrowser",
  "koff",
] as const;

export type ComposeServiceName = (typeof COMPOSE_SERVICES)[number];
