import { useCallback, useEffect, useState } from "react";
import { api, type PanelUser } from "../api";

export default function UsersTab() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const list = await api.listUsers();
      setUsers(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const pending = users.filter((u) => u.status === "pending");
  const approved = users.filter((u) => u.status === "approved");
  const rejected = users.filter((u) => u.status === "rejected");

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await api.approveUser(id);
      await fetchUsers();
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
      await fetchUsers();
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
      await fetchUsers();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
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

      {/* Approved users */}
      <section>
        <h3 className="text-sm font-semibold text-green-400 mb-3">
          Approved Users ({approved.length})
        </h3>
        {approved.length === 0 ? (
          <p className="text-xs text-gray-600">No approved users yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {approved.map((u) => (
              <div
                key={u.discord_id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3"
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
                    Approved{" "}
                    {u.approved_at ? new Date(u.approved_at * 1000).toLocaleDateString() : "—"}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(u.discord_id)}
                  disabled={actionLoading === u.discord_id}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-red-400 rounded-lg text-xs font-medium transition-colors"
                >
                  Remove
                </button>
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
