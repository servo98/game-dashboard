import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type InvitePublicInfo } from "../api";
import { AuthShell } from "../components/AuthShell";
import { GamepadIcon } from "../components/Icons";
import { Button, Notice, StatusMark } from "../components/ui";

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

    // Sin sesión no se puede aceptar: primero el OAuth de Discord
    try {
      await api.me();
    } catch {
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
      <AuthShell>
        <h1 className="text-title font-semibold text-ink">Invitación no válida</h1>
        <Notice className="mt-3">{error}</Notice>
        <Button tone="quiet" className="mt-5 w-full" onClick={() => navigate("/login")}>
          Ir al inicio de sesión
        </Button>
      </AuthShell>
    );
  }

  if (!info) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="label tick">Leyendo invitación</p>
      </div>
    );
  }

  if (accepted) {
    return (
      <AuthShell>
        <StatusMark tone="ok" label="Acceso concedido" />
        <p className="mt-3 text-body text-muted">Entrando al panel.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      footer={
        info.expires_at
          ? `Caduca el ${new Date(info.expires_at * 1000).toLocaleDateString()}.`
          : undefined
      }
    >
      <h1 className="text-title font-semibold text-ink">Te han invitado al panel</h1>
      {info.label && <p className="mt-1 text-body text-muted">{info.label}</p>}

      <p className="label mt-6">Tendrás acceso a</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {info.servers.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 py-2.5">
            {s.icon ? (
              <img src={s.icon} alt="" className="h-6 w-6 rounded-xs object-cover" />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded-xs border border-line bg-raised text-faint">
                <GamepadIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="text-body text-ink">{s.name}</span>
          </li>
        ))}
      </ul>

      <Button
        tone="accent"
        className="mt-6 h-10 w-full"
        onClick={handleAccept}
        disabled={accepting}
      >
        {accepting ? "Entrando" : "Aceptar invitación"}
      </Button>
    </AuthShell>
  );
}
