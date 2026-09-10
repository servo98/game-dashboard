import { useEffect, useState } from "react";
import { api, type BotSettings as BotSettingsType, type DiscordChannel } from "../api";
import { Button, Divider, Field, Notice, Panel, Select } from "./ui";

const CHANNEL_FIELDS = [
  {
    key: "allowed_channel_id" as const,
    label: "Canal de comandos",
    desc: "Limita los comandos del bot a este canal. En blanco, todos.",
  },
  {
    key: "errors_channel_id" as const,
    label: "Avisos de error",
    desc: "Aquí llegan los errores del panel.",
  },
  {
    key: "crashes_channel_id" as const,
    label: "Avisos de caída",
    desc: "Aquí llegan las caídas de los servidores de juego.",
  },
  {
    key: "logs_channel_id" as const,
    label: "Canal de registro",
    desc: "Mensajes de registro generales.",
  },
  {
    key: "quests_channel_id" as const,
    label: "Avisos de misiones",
    desc: "Anuncios de misiones completadas.",
  },
  {
    key: "invoices_channel_id" as const,
    label: "Avisos de facturas",
    desc: "Aviso cuando se sube una factura nueva.",
  },
];

export default function BotSettings() {
  const [settings, setSettings] = useState<BotSettingsType | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getBotSettings(), api.listChannels()])
      .then(([s, ch]) => {
        setSettings(s);
        setChannels(ch);
        setDraft({
          allowed_channel_id: s.allowed_channel_id,
          errors_channel_id: s.errors_channel_id,
          crashes_channel_id: s.crashes_channel_id,
          logs_channel_id: s.logs_channel_id,
          quests_channel_id: s.quests_channel_id,
          invoices_channel_id: s.invoices_channel_id,
        });
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateBotSettings(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="label tick py-4">Cargando ajustes del bot</p>;
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-title font-semibold text-ink">Ajustes del bot</h2>
        <Button tone="accent" size="sm" onClick={handleSave} disabled={saving}>
          {saved ? "Guardado" : saving ? "Guardando" : "Guardar"}
        </Button>
      </div>

      {error && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <Notice>{error}</Notice>
          </div>
        </>
      )}

      <Divider />
      <div className="flex flex-col gap-3.5 px-4 py-4">
        {CHANNEL_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.desc}>
            <Select
              value={draft[field.key] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [field.key]: e.target.value || null }))
              }
            >
              <option value="">Ninguno</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>

      <Divider />
      <div className="px-4 py-3">
        <p className="label mb-2">Comandos disponibles</p>
        <dl className="flex flex-col gap-1">
          {settings.commands.map((cmd) => (
            <div key={cmd.name} className="flex flex-wrap items-baseline gap-x-2">
              <dt className="num text-meta text-accent">/{cmd.name}</dt>
              <dd className="m-0 text-meta text-faint">{cmd.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}
