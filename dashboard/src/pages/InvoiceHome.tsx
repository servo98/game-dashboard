import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import FreelancerProfileForm from "../components/FreelancerProfileForm";
import InvoiceList from "../components/InvoiceList";
import InvoiceUpload from "../components/InvoiceUpload";

export default function InvoiceHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api
      .me()
      .then((u) => {
        if (u.status === "pending") {
          navigate("/pending", { replace: true });
          return;
        }
        if (u.status === "rejected") {
          navigate("/login?error=rejected", { replace: true });
          return;
        }
        if (!u.invoice_role) {
          // No invoice access
          setUser(u);
          return;
        }
        setUser(u);
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user.invoice_role) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-white">Facturas</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">
            No tienes acceso al sistema de facturas. Contacta a un admin.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Navbar */}
      <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-white">Facturas</span>
          <div className="flex items-center gap-3">
            {user.avatar && (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-8 h-8 rounded-full border border-gray-700"
              />
            )}
            <span className="text-sm text-gray-300">{user.username}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              {user.invoice_role}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {user.invoice_role === "contador" && (
          <InvoiceUpload onUploaded={() => setRefreshKey((k) => k + 1)} />
        )}

        <InvoiceList invoiceRole={user.invoice_role} refreshKey={refreshKey} />

        {user.invoice_role === "freelancer" && (
          <div className="mt-8">
            <FreelancerProfileForm />
          </div>
        )}
      </main>
    </div>
  );
}
