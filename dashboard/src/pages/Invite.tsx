import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type InvitePublicInfo } from "../api";

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InvitePublicInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!code) return;
    api
      .getInviteInfo(code)
      .then(setInfo)
      .catch((err) => setError((err as Error).message));
  }, [code]);

  async function handleAccept() {
    if (!code) return;

    // Check if user is logged in first
    try {
      await api.me();
    } catch {
      // Not logged in — redirect to Discord OAuth with invite code
      window.location.href = `/api/auth/discord?invite=${code}`;
      return;
    }

    setAccepting(true);
    try {
      await api.acceptInvite(code);
      setAccepted(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="text-3xl mb-3">:(</div>
          <h1 className="text-lg font-semibold text-white mb-2">Invite Invalid</h1>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate("/login")}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-green-800/50 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="text-3xl mb-3">&#10003;</div>
          <h1 className="text-lg font-semibold text-green-400 mb-2">You're in!</h1>
          <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-white mb-1">Game Panel Invite</h1>
          {info.label && <p className="text-sm text-gray-400">{info.label}</p>}
        </div>

        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-2">You'll get access to:</p>
          <div className="flex flex-col gap-2">
            {info.servers.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                {s.icon ? (
                  <img src={s.icon} alt="" className="w-6 h-6 rounded" />
                ) : (
                  <span className="text-lg">🎮</span>
                )}
                <span className="text-sm font-medium text-white">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        {info.expires_at && (
          <p className="text-xs text-gray-500 mb-4 text-center">
            Expires {new Date(info.expires_at * 1000).toLocaleDateString()}
          </p>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {accepting ? "Joining..." : "Accept Invite"}
        </button>
      </div>
    </div>
  );
}
