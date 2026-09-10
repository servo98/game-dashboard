import { useCallback, useEffect, useState } from "react";
import { api, type GameServer, type InviteLinkInfo, type PanelUser } from "../api";
import { CopyIcon, TrashIcon } from "./Icons";
import { Button, Divider, Field, Input, Loading, Panel, Select, Tag } from "./ui";

function InvoiceRoleSelect({ user, onChanged }: { user: PanelUser; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(role: string) {
    setSaving(true);
    try {
      await api.setInvoiceRole(user.discord_id, role || null);
      onChanged();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={user.invoice_role ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className="h-7 rounded-md border border-line bg-raised px-2 text-meta text-muted transition-colors duration-fast focus:border-accent focus:outline-none disabled:opacity-50"
      title="Rol de facturación"
    >
      <option value="">Sin rol factura</option>
      <option value="contador">Contador</option>
      <option value="freelancer">Freelancer</option>
    </select>
  );
}

/* Definir estos tres dentro de UsersTab hacía que React los tratara como un
   tipo de componente nuevo en cada render y desmontara su subárbol entero.
   Fuera del componente conservan identidad, así que ni se remontan ni tiran
   por la borda el foco de lo que haya dentro. */

/** URL del avatar de Discord, o null si el usuario no tiene. */
function avatarUrl(user: PanelUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png`;
}

/** Retrato del usuario, con iniciales cuando Discord no da avatar. */
function Portrait({ user }: { user: PanelUser }) {
  const url = avatarUrl(user);
  return url ? (
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full border border-line" />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-raised font-mono text-micro text-muted">
      {user.username.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Cabecera de bloque: título, recuento y, como mucho, una acción. */
function Head({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {count !== undefined && <span className="num text-micro text-faint">{count}</span>}
      </div>
      {action}
    </div>
  );
}

/** Selector de servidores compartido por el alta de invitación y el acceso. */
function ServerPicker({
  servers,
  selected,
  onToggle,
}: {
  servers: GameServer[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {servers.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            aria-pressed={on}
            className={`tap rounded-md border px-2 py-1 text-meta transition-colors ${
              on
                ? "border-accent bg-accent/12 text-accent"
                : "border-line bg-raised text-muted hover:text-ink"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

export default function UsersTab() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [invites, setInvites] = useState<InviteLinkInfo[]>([]);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [editAccessId, setEditAccessId] = useState<string | null>(null);
  const [editAccessServers, setEditAccessServers] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);

  // Invite creation
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [inviteServerIds, setInviteServerIds] = useState<string[]>([]);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState<number | undefined>(undefined);
  const [inviteMaxUses, setInviteMaxUses] = useState<number | undefined>(undefined);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [userList, inviteList, serverList] = await Promise.all([
        api.listUsers(),
        api.listInvites(),
        api.listServers(),
      ]);
      setUsers(userList);
      setInvites(inviteList);
      setServers(serverList);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const pending = users.filter((u) => u.status === "pending");
  const approved = users.filter((u) => u.status === "approved" && u.role !== "admin");
  const admins = users.filter((u) => u.role === "admin");
  const rejected = users.filter((u) => u.status === "rejected");

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await api.approveUser(id);
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    try {
      await api.rejectUser(id);
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    try {
      await api.deleteUser(id);
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  function startEditAccess(user: PanelUser) {
    setEditAccessId(user.discord_id);
    setEditAccessServers(user.server_access ?? []);
  }

  async function saveAccess() {
    if (!editAccessId) return;
    setSavingAccess(true);
    try {
      await api.setUserServers(editAccessId, editAccessServers);
      await fetchAll();
      setEditAccessId(null);
    } catch {
      // ignore
    } finally {
      setSavingAccess(false);
    }
  }

  function toggleServerAccess(serverId: string) {
    setEditAccessServers((prev) =>
      prev.includes(serverId) ? prev.filter((s) => s !== serverId) : [...prev, serverId],
    );
  }

  async function handleCreateInvite() {
    if (inviteServerIds.length === 0) return;
    setCreatingInvite(true);
    try {
      const res = await api.createInvite({
        server_ids: inviteServerIds,
        expires_in_hours: inviteExpiry,
        max_uses: inviteMaxUses,
        label: inviteLabel || undefined,
      });
      await fetchAll();
      setShowCreateInvite(false);
      setInviteServerIds([]);
      setInviteLabel("");
      setInviteExpiry(undefined);
      setInviteMaxUses(undefined);
      // Auto-copy
      navigator.clipboard.writeText(res.url);
      setCopiedCode(res.code);
      setTimeout(() => setCopiedCode(null), 3000);
    } catch {
      // ignore
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleDeleteInvite(id: number) {
    try {
      await api.deleteInvite(id);
      await fetchAll();
    } catch {
      // ignore
    }
  }

  function copyInviteUrl(code: string) {
    const publicUrl = window.location.origin;
    navigator.clipboard.writeText(`${publicUrl}/invite/${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  if (loading) {
    return <Loading className="py-8">Cargando usuarios</Loading>;
  }

  const stamp = (unix: number) => new Date(unix * 1000).toLocaleDateString();

  return (
    <div className="flex flex-col gap-5">
      {/* Invitaciones */}
      <Panel>
        <Head
          title="Enlaces de invitación"
          count={invites.length}
          action={
            <Button
              tone={showCreateInvite ? "quiet" : "accent"}
              size="sm"
              onClick={() => setShowCreateInvite(!showCreateInvite)}
            >
              {showCreateInvite ? "Cancelar" : "Crear invitación"}
            </Button>
          }
        />

        {showCreateInvite && (
          <>
            <Divider />
            <div className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <span className="label">Servidores a los que da acceso</span>
                <ServerPicker
                  servers={servers}
                  selected={inviteServerIds}
                  onToggle={(id) =>
                    setInviteServerIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                />
              </div>

              <Field label="Etiqueta (opcional)">
                <Input
                  value={inviteLabel}
                  onChange={(e) => setInviteLabel(e.target.value)}
                  placeholder="Para el grupo del jueves"
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Caducidad">
                  <Select
                    value={inviteExpiry ?? ""}
                    onChange={(e) =>
                      setInviteExpiry(e.target.value ? Number(e.target.value) : undefined)
                    }
                  >
                    <option value="">Sin caducidad</option>
                    <option value="1">1 hora</option>
                    <option value="24">24 horas</option>
                    <option value="168">7 días</option>
                    <option value="720">30 días</option>
                  </Select>
                </Field>
                <Field label="Usos">
                  <Select
                    value={inviteMaxUses ?? ""}
                    onChange={(e) =>
                      setInviteMaxUses(e.target.value ? Number(e.target.value) : undefined)
                    }
                  >
                    <option value="">Ilimitados</option>
                    <option value="1">1 uso</option>
                    <option value="5">5 usos</option>
                    <option value="10">10 usos</option>
                    <option value="25">25 usos</option>
                  </Select>
                </Field>
              </div>

              <div>
                <Button
                  tone="accent"
                  onClick={handleCreateInvite}
                  disabled={inviteServerIds.length === 0 || creatingInvite}
                >
                  {creatingInvite ? "Creando" : "Crear y copiar enlace"}
                </Button>
              </div>
            </div>
          </>
        )}

        <Divider />
        {invites.length === 0 ? (
          <p className="px-4 py-3 text-body text-faint">No hay invitaciones activas.</p>
        ) : (
          <div className="divide-y divide-line">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                  inv.expired ? "opacity-55" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-body text-accent">{inv.code}</span>
                    {inv.label && (
                      <span className="truncate text-meta text-faint">{inv.label}</span>
                    )}
                    {inv.expired && <Tag tone="danger">Caducada</Tag>}
                  </div>
                  <p className="num mt-0.5 text-micro text-faint">
                    {inv.servers.map((s) => s.name).join(", ")} · {inv.use_count}
                    {inv.max_uses ? `/${inv.max_uses}` : ""} usos
                    {inv.expires_at ? ` · caduca el ${stamp(inv.expires_at)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => copyInviteUrl(inv.code)}
                    title="Copiar enlace"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    {copiedCode === inv.code ? "Copiado" : "Copiar"}
                  </Button>
                  <Button
                    tone="ghost"
                    size="sm"
                    icon
                    onClick={() => handleDeleteInvite(inv.id)}
                    title="Borrar invitación"
                    className="hover:text-danger"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Solicitudes pendientes: lo único que exige una decisión hoy */}
      {pending.length > 0 && (
        <Panel rail>
          <Head title="Solicitudes pendientes" count={pending.length} />
          <Divider />
          <div className="divide-y divide-line">
            {pending.map((u) => (
              <div key={u.discord_id} className="flex items-center gap-3 px-4 py-2.5">
                <Portrait user={u} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{u.username}</p>
                  <p className="num text-micro text-faint">
                    Pidió acceso el {stamp(u.requested_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    tone="accent"
                    size="sm"
                    onClick={() => handleApprove(u.discord_id)}
                    disabled={actionLoading === u.discord_id}
                  >
                    Aprobar
                  </Button>
                  <Button
                    tone="danger"
                    size="sm"
                    onClick={() => handleReject(u.discord_id)}
                    disabled={actionLoading === u.discord_id}
                  >
                    Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Administradores */}
      <Panel>
        <Head title="Administradores" count={admins.length} />
        <Divider />
        <div className="divide-y divide-line">
          {admins.map((u) => (
            <div key={u.discord_id} className="flex items-center gap-3 px-4 py-2.5">
              <Portrait user={u} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{u.username}</p>
                <p className="text-micro text-faint">Acceso total al panel</p>
              </div>
              <InvoiceRoleSelect user={u} onChanged={fetchAll} />
            </div>
          ))}
        </div>
      </Panel>

      {/* Usuarios */}
      <Panel>
        <Head title="Usuarios" count={approved.length} />
        <Divider />
        {approved.length === 0 ? (
          <p className="px-4 py-3 text-body text-faint">Todavía no hay usuarios aprobados.</p>
        ) : (
          <div className="divide-y divide-line">
            {approved.map((u) => (
              <div key={u.discord_id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Portrait user={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{u.username}</p>
                    <p className="truncate text-micro text-faint">
                      {u.server_access && u.server_access.length > 0
                        ? servers
                            .filter((s) => u.server_access?.includes(s.id))
                            .map((s) => s.name)
                            .join(", ")
                        : "Sin acceso a servidores"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <InvoiceRoleSelect user={u} onChanged={fetchAll} />
                    <Button size="sm" onClick={() => startEditAccess(u)}>
                      Acceso
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      icon
                      onClick={() => handleDelete(u.discord_id)}
                      disabled={actionLoading === u.discord_id}
                      title="Quitar del panel"
                      className="hover:text-danger"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {editAccessId === u.discord_id && (
                  <div className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
                    <span className="label">Servidores a los que puede entrar</span>
                    <ServerPicker
                      servers={servers}
                      selected={editAccessServers}
                      onToggle={toggleServerAccess}
                    />
                    <div className="flex gap-1.5">
                      <Button tone="accent" size="sm" onClick={saveAccess} disabled={savingAccess}>
                        {savingAccess ? "Guardando" : "Guardar"}
                      </Button>
                      <Button tone="ghost" size="sm" onClick={() => setEditAccessId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Rechazados: plegado, porque no piden nada */}
      {rejected.length > 0 && (
        <Panel>
          <button
            type="button"
            onClick={() => setShowRejected(!showRejected)}
            aria-expanded={showRejected}
            className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-baseline gap-2">
              <span className="text-title font-semibold text-muted">Rechazados</span>
              <span className="num text-micro text-faint">{rejected.length}</span>
            </span>
            <span className="label">{showRejected ? "Ocultar" : "Ver"}</span>
          </button>

          {showRejected && (
            <>
              <Divider />
              <div className="divide-y divide-line">
                {rejected.map((u) => (
                  <div key={u.discord_id} className="flex items-center gap-3 px-4 py-2.5">
                    <Portrait user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-muted">{u.username}</p>
                      <p className="num text-micro text-faint">
                        Pidió acceso el {stamp(u.requested_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(u.discord_id)}
                        disabled={actionLoading === u.discord_id}
                      >
                        Aprobar
                      </Button>
                      <Button
                        tone="ghost"
                        size="sm"
                        icon
                        onClick={() => handleDelete(u.discord_id)}
                        disabled={actionLoading === u.discord_id}
                        title="Borrar solicitud"
                        className="hover:text-danger"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
