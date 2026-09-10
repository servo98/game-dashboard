import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { AuthShell } from "../components/AuthShell";
import { Button, StatusMark } from "../components/ui";

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

  // Sondeo cada 10s para detectar la aprobación sin recargar
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
      <div className="grid min-h-screen place-items-center">
        <p className="label tick">Comprobando acceso</p>
      </div>
    );
  }

  return (
    <AuthShell footer="Esta pantalla se abrirá sola en cuanto te aprueben.">
      <div className="flex items-center gap-3">
        {user.avatar && (
          <img src={user.avatar} alt="" className="h-10 w-10 rounded-full border border-line" />
        )}
        <div className="min-w-0">
          <p className="truncate text-title font-semibold text-ink">{user.username}</p>
          <StatusMark tone="warn" label="Pendiente de aprobación" live className="mt-1" />
        </div>
      </div>

      <p className="mt-5 text-body text-muted">
        Tu solicitud ya está enviada. Un administrador la revisará en cuanto pueda.
      </p>

      <Button tone="quiet" className="mt-5 w-full" onClick={handleLogout}>
        Cerrar sesión
      </Button>
    </AuthShell>
  );
}
