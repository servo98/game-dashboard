import { useEffect, useState } from "react";
import { api, type FreelancerProfile } from "../api";

export default function FreelancerProfileForm() {
  const [profile, setProfile] = useState<Partial<FreelancerProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getInvoiceProfile()
      .then((p) => {
        if (p) setProfile(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateInvoiceProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof FreelancerProfile, label: string, placeholder?: string) {
    return (
      <div>
        <label className="block text-meta text-muted mb-1">{label}</label>
        <input
          type="text"
          value={(profile[key] as string) ?? ""}
          onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value || null }))}
          placeholder={placeholder}
          className="w-full bg-bg border border-line rounded-md px-3 py-2 text-body text-ink placeholder:text-faint focus:outline-none focus:border-accent"
        />
      </div>
    );
  }

  if (loading) {
    return <div className="text-faint text-body tick py-4">Cargando perfil</div>;
  }

  return (
    <div className="bg-surface border border-line rounded-lg p-5">
      <h3 className="font-semibold text-ink mb-4">Perfil de Facturacion</h3>

      {error && (
        <div className="text-body text-danger bg-danger/10 border border-danger/35 rounded-md px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {field("display_name", "Nombre", "Fernando Servin Victoria")}
          {field("rfc", "RFC", "XXXX000000XXX")}
        </div>
        {field("email", "Email", "tu@email.com")}

        <div className="border-t border-line pt-3 mt-1">
          <p className="text-meta text-faint mb-2">Datos bancarios (para PDF comercial)</p>
          <div className="flex flex-col gap-3">
            {field("bank_name", "Banco", "Lead Bank (USA)")}
            {field("account_holder", "Beneficiario", "Fernando Servin Victoria")}
            <div className="grid grid-cols-2 gap-3">
              {field("account_number", "No. Cuenta", "216250421421")}
              {field("routing_number", "Routing (ABA)", "101019644")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("account_type", "Tipo de cuenta", "Checking")}
              {field("currency", "Moneda", "USD")}
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-3 mt-1">
          <p className="text-meta text-faint mb-2">Billed To (datos del cliente en el PDF)</p>
          <div className="flex flex-col gap-3">
            {field("billed_to_name", "Nombre empresa", "Express Network")}
            {field("billed_to_address", "Direccion", "1605 W. Olympic Blvd., Suite 800...")}
            {field("billed_to_phone", "Telefono", "888-232-6077")}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="tap self-start px-5 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-accent-ink text-body font-medium rounded-md transition-colors mt-2"
        >
          {saved ? "Guardado" : saving ? "Guardando..." : "Guardar Perfil"}
        </button>
      </div>
    </div>
  );
}
