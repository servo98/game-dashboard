import { useCallback, useEffect, useState } from "react";
import { api, type GameServer, type InviteLinkInfo, type PanelUser } from "../api";

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
      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 disabled:opacity-50"
      title="Invoice role"
    >
      <option value="">Sin rol factura</option>
      <option value="contador">Contador</option>
      <option value="freelancer">Freelancer</option>
    </select>
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

  function avatarUrl(user: PanelUser) {
    if (!user.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png`;
  }

  if (loading) {
    return (
      <div className="text-gray-500 text-sm animate-pulse py-8 text-center">Loading users...</div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Invite Links */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-brand-400">Invite Links</h3>
          <button
            onClick={() => setShowCreateInvite(!showCreateInvite)}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium transition-colors"
          >
            + Create Invite
          </button>
        </div>

        {/* Create invite form */}
        {showCreateInvite && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
            <p className="text-xs text-gray-400 mb-2">Select servers to grant access:</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {servers.map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    setInviteServerIds((prev) =>
                      prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    inviteServerIds.includes(s.id)
                      ? "bg-brand-500 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 mb-3">
              <input
                type="text"
                placeholder="Label (optional)"
                value={inviteLabel}
                onChange={(e) => setInviteLabel(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500"
              />
              <div className="flex gap-2">
                <select
                  value={inviteExpiry ?? ""}
                  onChange={(e) =>
                    setInviteExpiry(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white flex-1"
                >
                  <option value="">No expiry</option>
                  <option value="1">1 hour</option>
                  <option value="24">24 hours</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
                <select
                  value={inviteMaxUses ?? ""}
                  onChange={(e) =>
                    setInviteMaxUses(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white flex-1"
                >
                  <option value="">Unlimited uses</option>
                  <option value="1">1 use</option>
                  <option value="5">5 uses</option>
                  <option value="10">10 uses</option>
                  <option value="25">25 uses</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateInvite}
                disabled={inviteServerIds.length === 0 || creatingInvite}
                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {creatingInvite ? "Creating..." : "Create & Copy Link"}
              </button>
              <button
                onClick={() => setShowCreateInvite(false)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active invites */}
        {invites.length === 0 ? (
          <p className="text-xs text-gray-600">No active invite links.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className={`bg-gray-900 border rounded-xl p-3 ${
                  inv.expired ? "border-gray-800 opacity-50" : "border-gray-800"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-brand-400">{inv.code}</span>
                    {inv.label && <span className="text-xs text-gray-500">({inv.label})</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyInviteUrl(inv.code)}
                      className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {copiedCode === inv.code ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleDeleteInvite(inv.id)}
                      className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Servers: {inv.servers.map((s) => s.name).join(", ")}</span>
                  <span>
                    Uses: {inv.use_count}
                    {inv.max_uses ? `/${inv.max_uses}` : ""}
                  </span>
                  {inv.expires_at && (
                    <span>
                      {inv.expired
                        ? "Expired"
                        : `Expires ${new Date(inv.expires_at * 1000).toLocaleDateString()}`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending requests */}
      {pending.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-yellow-400 mb-3">
            Pending Requests ({pending.length})
          </h3>
          <div className="flex flex-col gap-2">
            {pending.map((u) => (
              <div
                key={u.discord_id}
                className="bg-gray-900 border border-yellow-800/40 rounded-xl p-4 flex items-center gap-3"
              >
                {avatarUrl(u) ? (
                  <img
                    src={avatarUrl(u)!}
                    alt=""
                    className="w-10 h-10 rounded-full border border-gray-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.username}</p>
                  <p className="text-xs text-gray-500">
                    Requested {new Date(u.requested_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleApprove(u.discord_id)}
                    disabled={actionLoading === u.discord_id}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(u.discord_id)}
                    disabled={actionLoading === u.discord_id}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admins */}
      {admins.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-purple-400 mb-3">Admins ({admins.length})</h3>
          <div className="flex flex-col gap-2">
            {admins.map((u) => (
              <div
                key={u.discord_id}
                className="bg-gray-900 border border-purple-800/30 rounded-xl p-4 flex items-center gap-3"
              >
                {avatarUrl(u) ? (
                  <img
                    src={avatarUrl(u)!}
                    alt=""
                    className="w-10 h-10 rounded-full border border-gray-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.username}</p>
                  <p className="text-xs text-purple-400/60">Admin — full access</p>
                </div>
                <InvoiceRoleSelect user={u} onChanged={fetchAll} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Approved users (non-admin) with server access */}
      <section>
        <h3 className="text-sm font-semibold text-green-400 mb-3">Users ({approved.length})</h3>
        {approved.length === 0 ? (
          <p className="text-xs text-gray-600">
            No users yet. Create an invite link above to invite friends.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {approved.map((u) => (
              <div key={u.discord_id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  {avatarUrl(u) ? (
                    <img
                      src={avatarUrl(u)!}
                      alt=""
                      className="w-10 h-10 rounded-full border border-gray-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.username}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(u.server_access ?? []).length === 0 ? (
                        <span className="text-xs text-gray-600">No server access</span>
                      ) : (
                        (u.server_access ?? []).map((sid) => {
                          const srv = servers.find((s) => s.id === sid);
                          return (
                            <span
                              key={sid}
                              className="px-1.5 py-0.5 bg-gray-800 rounded text-xs text-gray-400"
                            >
                              {srv?.name ?? sid}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <InvoiceRoleSelect user={u} onChanged={fetchAll} />
                    <button
                      onClick={() => startEditAccess(u)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      Edit Access
                    </button>
                    <button
                      onClick={() => handleDelete(u.discord_id)}
                      disabled={actionLoading === u.discord_id}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-red-400 rounded-lg text-xs font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Edit access inline */}
                {editAccessId === u.discord_id && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <p className="text-xs text-gray-400 mb-2">Server access:</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {servers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => toggleServerAccess(s.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            editAccessServers.includes(s.id)
                              ? "bg-brand-500 text-white"
                              : "bg-gray-800 text-gray-400 hover:text-white"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveAccess}
                        disabled={savingAccess}
                        className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        {savingAccess ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => setEditAccessId(null)}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rejected (collapsible) */}
      {rejected.length > 0 && (
        <section>
          <button
            onClick={() => setShowRejected(!showRejected)}
            className="text-sm font-semibold text-gray-500 hover:text-gray-300 transition-colors mb-3 flex items-center gap-1"
          >
            <span className={`transition-transform ${showRejected ? "rotate-90" : ""}`}>▸</span>
            Rejected ({rejected.length})
          </button>
          {showRejected && (
            <div className="flex flex-col gap-2">
              {rejected.map((u) => (
                <div
                  key={u.discord_id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3 opacity-60"
                >
                  {avatarUrl(u) ? (
                    <img
                      src={avatarUrl(u)!}
                      alt=""
                      className="w-10 h-10 rounded-full border border-gray-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.username}</p>
                    <p className="text-xs text-gray-500">
                      Requested {new Date(u.requested_at * 1000).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleApprove(u.discord_id)}
                      disabled={actionLoading === u.discord_id}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDelete(u.discord_id)}
                      disabled={actionLoading === u.discord_id}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-red-400 rounded-lg text-xs font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
