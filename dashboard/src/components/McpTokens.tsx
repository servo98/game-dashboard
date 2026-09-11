import { useCallback, useEffect, useState } from "react";
import { api, type McpTokenRecord, type McpTool } from "../api";
import { TrashIcon } from "./Icons";
import { Button, Checkbox, Divider, Field, Input, Notice, Panel, Tag } from "./ui";

/** Un bloque de herramientas del MCP con su nombre técnico y qué hace. */
function ToolList({ title, hint, tools }: { title: string; hint: string; tools: McpTool[] }) {
  if (tools.length === 0) return null;
  return (
    <div>
      <p className="label mb-0.5">{title}</p>
      <p className="mb-2 text-meta text-faint">{hint}</p>
      <dl className="flex flex-col gap-1">
        {tools.map((tool) => (
          <div key={tool.name} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="num text-meta text-accent">{tool.name}</dt>
            <dd className="m-0 text-meta text-faint">{tool.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function McpTokens() {
  const [tokens, setTokens] = useState<McpTokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New token form
  const [showForm, setShowForm] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [label, setLabel] = useState("");
  const [isAdminToken, setIsAdminToken] = useState(false);
  const [creating, setCreating] = useState(false);

  // Herramientas que el MCP expone. Se piden al backend en vez de mantener una
  // lista aquí: escrita a mano se quedó enseñando 7 de las 18 que existen.
  const [tools, setTools] = useState<McpTool[]>([]);

  // Newly created token (show once)
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      const list = await api.listMcpTokens();
      setTokens(list);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
    // Si falla, la sección de herramientas simplemente no se pinta: es
    // documentación, no debe tumbar la pestaña de llaves.
    api
      .listMcpTools()
      .then(setTools)
      .catch(() => {});
  }, [fetchTokens]);

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createMcpToken({
        player_name: playerName.trim(),
        label: label.trim() || undefined,
        is_admin: isAdminToken,
      });
      setNewToken(result.token);
      setShowForm(false);
      setPlayerName("");
      setLabel("");
      setIsAdminToken(false);
      await fetchTokens();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await api.deleteMcpToken(id);
      await fetchTokens();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <p className="label tick py-4">Cargando llaves</p>;
  }

  const stamp = (unix: number) => new Date(unix * 1000).toLocaleDateString();

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-title font-semibold text-ink">Llaves de acceso MCP</h2>
          <Button
            tone={showForm ? "quiet" : "accent"}
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              setNewToken(null);
            }}
          >
            {showForm ? "Cancelar" : "Generar llave"}
          </Button>
        </div>

        {error && (
          <>
            <Divider />
            <div className="px-4 py-3">
              <Notice>{error}</Notice>
            </div>
          </>
        )}

        {/* La llave solo se ve una vez: se avisa y se pone a mano de copiar */}
        {newToken && (
          <>
            <Divider />
            <div className="flex flex-col gap-2 px-4 py-3">
              <p className="text-body text-warn">Cópiala ahora. No se vuelve a mostrar.</p>
              <div className="flex items-center gap-2">
                <code className="num min-w-0 flex-1 select-all break-all rounded-md border border-line bg-raised px-2.5 py-2 text-body text-ink">
                  {newToken}
                </code>
                <Button onClick={() => handleCopy(newToken)} className="shrink-0">
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
          </>
        )}

        {showForm && (
          <>
            <Divider />
            <div className="flex flex-col gap-3 px-4 py-3">
              <Field label="Nombre de jugador en Minecraft">
                <Input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="p. ej. Steve"
                />
              </Field>
              <Field label="Etiqueta (opcional)">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="p. ej. Claude Desktop"
                />
              </Field>
              <Checkbox
                checked={isAdminToken}
                onChange={(e) => setIsAdminToken(e.target.checked)}
                label={
                  <>
                    <span className="font-medium text-ink">Llave de administrador.</span> Habilita
                    las herramientas que tocan el servidor de verdad: arrancar, detener, reiniciar,
                    ejecutar órdenes por RCON, cambiar variables de entorno, actualizar la imagen de
                    Docker y dar de alta servidores nuevos. Dásela solo a clientes en los que
                    confíes.
                  </>
                }
              />
              <div>
                <Button
                  tone="accent"
                  onClick={handleCreate}
                  disabled={creating || !playerName.trim()}
                >
                  {creating ? "Creando" : "Crear llave"}
                </Button>
              </div>
            </div>
          </>
        )}

        <Divider />
        {tokens.length === 0 ? (
          <p className="px-4 py-3 text-body text-faint">
            Todavía no hay llaves. Crea una para conectar tu asistente.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-body font-medium text-ink">{t.player_name}</span>
                    {t.label && <span className="truncate text-meta text-faint">{t.label}</span>}
                    {t.is_admin && <Tag tone="warn">Admin</Tag>}
                  </div>
                  <div className="num mt-0.5 text-micro text-faint">
                    {t.token_preview} · creada el {stamp(t.created_at)}
                    {t.last_used_at && ` · usada el ${stamp(t.last_used_at)}`}
                  </div>
                </div>
                <Button
                  tone="ghost"
                  size="sm"
                  icon
                  onClick={() => handleDelete(t.id)}
                  title="Revocar llave"
                  className="shrink-0 hover:text-danger"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="px-4 py-3">
          <h2 className="text-title font-semibold text-ink">Cómo conectarse</h2>
        </div>
        <Divider />

        <div className="flex flex-col gap-4 px-4 py-3">
          <div>
            <p className="label mb-2">Claude.ai, integraciones</p>
            <ol className="list-inside list-decimal space-y-1 text-body text-muted">
              <li>Entra en claude.ai, Ajustes, Integraciones.</li>
              <li>Pulsa «Añadir integración personalizada».</li>
              <li>
                Nombre: <span className="text-ink">Game Panel</span>
              </li>
              <li>
                URL:{" "}
                <code className="num rounded-xs bg-raised px-1.5 py-0.5 text-accent">
                  https://game.aypapol.com/api/mcp
                </code>
              </li>
              <li>Guarda. El acceso con OAuth se resuelve solo.</li>
            </ol>
            <p className="mt-2 text-meta text-faint">
              Usa OAuth 2.0: te pedirá iniciar sesión con Discord y autorizar el acceso.
            </p>
          </div>

          <div>
            <p className="label mb-2">Claude Code, línea de órdenes</p>
            <code className="num block break-all rounded-md border border-line bg-raised px-2.5 py-2 text-meta text-muted">
              claude mcp add game-panel -t streamable-http https://game.aypapol.com/api/mcp -h
              "Authorization: Bearer TU_LLAVE"
            </code>
          </div>

          {tools.length > 0 && (
            <div className="flex flex-col gap-3">
              {/* Separadas por lo único que le cambia la vida a quien crea una
                  llave: si la suya podrá usarlas o le dirá que no tiene permiso. */}
              <ToolList
                title="Herramientas de consulta"
                hint="Disponibles con cualquier llave."
                tools={tools.filter((t) => !t.admin)}
              />
              <ToolList
                title="Herramientas de administración"
                hint="Solo con llave de administrador."
                tools={tools.filter((t) => t.admin)}
              />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
