/**
 * Textos en castellano de las herramientas MCP, para la pestaña MCP del panel.
 *
 * Las descripciones que viven en `mcp.ts` están en inglés y escritas para el
 * modelo, no para una persona: dicen cosas como "Defaults to the currently
 * running server". Aquí está lo que se le enseña a quien va a crear una llave.
 *
 * Qué herramientas existen y cuáles piden llave de administrador NO se declara
 * aquí: eso se lee del servidor MCP de verdad, así que esta tabla solo traduce.
 * Un test comprueba que no falte ninguna, que es lo que evita que la pestaña se
 * quede vieja cada vez que el MCP crece.
 */
export const MCP_TOOL_LABELS: Record<string, string> = {
  // Lectura
  list_servers: "Todos los servidores del panel, con su estado",
  server_status: "Estado del servidor y quién está dentro",
  list_quests: "Capítulos y misiones del modpack",
  get_quest_details: "Detalle de una misión concreta",
  get_quest_progress: "Tu progreso en las misiones",
  suggest_next: "Qué misiones puedes hacer ahora",
  search_recipes: "Busca recetas en los scripts del modpack",
  player_stats: "Estadísticas de Minecraft: bajas, minería y demás",
  list_players: "Quién ha entrado y cuánto ha jugado",
  leaderboard: "Ranking de jugadores por estadísticas",
  list_mods: "Lista de mods instalados",

  // Administración
  start_server: "Arranca un servidor",
  stop_server: "Detiene un servidor",
  restart_server: "Reinicia un servidor",
  run_command: "Ejecuta órdenes por RCON en el servidor",
  update_server_env: "Cambia las variables de entorno",
  update_server_image: "Cambia la imagen de Docker",
  create_server: "Da de alta un servidor nuevo",
};
