import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";

export default function Pending() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api
      .me()
      .then((u) => {
        if (u.status === "approved") {
          navigate("/", { replace: true });
          return;
        }
        if (u.status === "rejected") {
          navigate("/login?error=rejected", { replace: true });
          return;
        }
        setUser(u);
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);

  // Poll /me every 10s to detect approval
  useEffect(() => {
    const interval = setInterval(() => {
      api
        .me()
        .then((u) => {
          if (u.status === "approved") {
            navigate("/", { replace: true });
          } else if (u.status === "rejected") {
            navigate("/login?error=rejected", { replace: true });
          }
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 flex flex-col items-center gap-6 shadow-2xl max-w-sm w-full">
        {user.avatar && (
          <img
            src={user.avatar}
            alt={user.username}
            className="w-20 h-20 rounded-full border-2 border-gray-700"
          />
        )}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-bold text-white">{user.username}</h1>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-yellow-400 text-sm font-medium">Pending Approval</span>
          </div>
        </div>

        <p className="text-gray-400 text-sm text-center">
          Your access request has been submitted. An administrator will review it shortly.
        </p>

        <p className="text-gray-600 text-xs text-center">
          This page will automatically redirect once approved.
        </p>

        <button
          onClick={handleLogout}
          className="w-full text-center text-sm text-gray-500 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-gray-800"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
