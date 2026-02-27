import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const isUnauthorized = params.get("error") === "unauthorized";

  // If already logged in, redirect to home
  useEffect(() => {
    api.me()
      .then(() => navigate("/", { replace: true }))
      .catch(() => {/* not logged in, stay on login page */});
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 flex flex-col items-center gap-6 shadow-2xl max-w-sm w-full">
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-9 h-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 003 3h7.5a3 3 0 003-3m-13.5 0V9a2.25 2.25 0 012.25-2.25h9A2.25 2.25 0 0118.75 9v5.25m-13.5 0H3m15.75 0H21"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Game Panel</h1>
          <p className="text-gray-400 text-sm text-center">
            Manage your game servers from one place
          </p>
        </div>

        {/* Discord login */}
        <a
          href={api.loginUrl()}
          className="w-full flex items-center justify-center gap-3 bg-discord hover:bg-[#4752c4] transition-colors rounded-xl px-5 py-3 font-semibold text-white shadow-md"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Login with Discord
        </a>

        {isUnauthorized && (
          <p className="text-red-400 text-xs text-center bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
            Tu cuenta Discord no tiene acceso a este panel.
          </p>
        )}

        <p className="text-gray-600 text-xs text-center">
          You need a Discord account to access this panel
        </p>
      </div>
    </div>
  );
}
