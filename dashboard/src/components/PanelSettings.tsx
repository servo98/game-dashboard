import { useEffect, useState } from "react";
import { api, type PanelSettings as PanelSettingsType } from "../api";
import { Button, Divider, Field, MonoInput, Notice, Panel } from "./ui";

export default function PanelSettings() {
  const [settings, setSettings] = useState<PanelSettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((err) => setError((err as Error).message));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateSettings(settings);
      setMsg("Ajustes guardados.");
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="label tick py-4">Cargando ajustes</p>;
  }

  /** Todos los límites son numéricos y comparten el mismo trato. */
  const LIMITS = [
    {
      key: "game_memory_limit_gb" as const,
      label: "Memoria por juego (GB)",
      hint: "RAM máxima que puede pedir un contenedor de juego.",
      min: "1",
      max: "64",
      step: "0.5",
    },
    {
      key: "host_memory_limit_gb" as const,
      label: "Memoria del anfitrión (GB)",
      hint: "Presupuesto total de RAM. Un servidor no arranca si al sumarlo se pasa de aquí.",
      min: "1",
      max: "256",
      step: "1",
    },
    {
      key: "game_cpu_limit" as const,
      label: "CPU por juego (vCPU)",
      hint: "vCPU máximas que puede consumir un contenedor de juego.",
      min: "0.5",
      max: "16",
      step: "0.5",
    },
    {
      key: "auto_stop_hours" as const,
      label: "Parada automática (horas)",
      hint: "Detiene el servidor tras N horas encendido. A 0 queda desactivado.",
      min: "0",
      max: "72",
      step: "1",
    },
    {
      key: "max_backups_per_server" as const,
      label: "Copias por servidor",
      hint: "Al superar el límite se borran las copias más antiguas.",
      min: "1",
      max: "20",
      step: "1",
    },
    {
      key: "auto_backup_interval_hours" as const,
      label: "Intervalo de copia automática (horas)",
      hint: "Copia el servidor activo cada N horas. A 0 queda desactivado.",
      min: "0",
      max: "168",
      step: "1",
    },
  ];

  return (
    <form onSubmit={handleSave}>
      <Panel>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-title font-semibold text-ink">Ajustes del panel</h2>
          <Button tone="accent" size="sm" type="submit" disabled={saving}>
            {saving ? "Guardando" : "Guardar"}
          </Button>
        </div>

        {(error || msg) && (
          <>
            <Divider />
            <div className="px-4 py-3">
              {error && <Notice>{error}</Notice>}
              {msg && <Notice tone="ok">{msg}</Notice>}
            </div>
          </>
        )}

        <Divider />
        <div className="flex flex-col gap-3.5 px-4 py-4">
          <Field
            label="Dominio del anfitrión"
            hint="Se usa para componer las direcciones de conexión, por ejemplo aypapol.com:27015."
          >
            <MonoInput
              type="text"
              value={settings.host_domain}
              onChange={(e) => setSettings({ ...settings, host_domain: e.target.value })}
              placeholder="aypapol.com"
            />
          </Field>

          {LIMITS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <MonoInput
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={settings[f.key]}
                onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Panel>
    </form>
  );
}
