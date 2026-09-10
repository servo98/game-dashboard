import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import FreelancerProfileForm from "../components/FreelancerProfileForm";
import InvoiceList from "../components/InvoiceList";
import InvoiceUpload from "../components/InvoiceUpload";
import { Loading } from "../components/ui";

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
        <Loading>Cargando facturas</Loading>
      </div>
    );
  }

  if (!user.invoice_role) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <header className="border-b border-line bg-bg sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-ink">Facturas</span>
            <button
              onClick={handleLogout}
              className="tap text-meta text-faint hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-raised"
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-faint">
            No tienes acceso al sistema de facturas. Contacta a un admin.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Navbar */}
      <header className="border-b border-line bg-bg sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-ink">Facturas</span>
          <div className="flex items-center gap-3">
            {user.avatar && (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-8 h-8 rounded-full border border-line"
              />
            )}
            <span className="text-body text-muted">{user.username}</span>
            <span className="text-meta px-2 py-0.5 rounded-full bg-raised text-muted">
              {user.invoice_role}
            </span>
            <button
              onClick={handleLogout}
              className="tap text-meta text-faint hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-raised"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <InvoiceUpload
          invoiceRole={user.invoice_role}
          onUploaded={() => setRefreshKey((k) => k + 1)}
        />

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
