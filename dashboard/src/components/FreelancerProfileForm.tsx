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
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        <input
          type="text"
          value={(profile[key] as string) ?? ""}
          onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value || null }))}
          placeholder={placeholder}
          className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
        />
      </div>
    );
  }

  if (loading) {
    return <div className="text-gray-500 text-sm animate-pulse py-4">Loading profile...</div>;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h3 className="font-semibold text-gray-200 mb-4">Perfil de Facturacion</h3>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {field("display_name", "Nombre", "Fernando Servin Victoria")}
          {field("rfc", "RFC", "XXXX000000XXX")}
        </div>
        {field("email", "Email", "tu@email.com")}

        <div className="border-t border-gray-800 pt-3 mt-1">
          <p className="text-xs text-gray-500 mb-2">Datos bancarios (para PDF comercial)</p>
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

        <div className="border-t border-gray-800 pt-3 mt-1">
          <p className="text-xs text-gray-500 mb-2">Billed To (datos del cliente en el PDF)</p>
          <div className="flex flex-col gap-3">
            {field("billed_to_name", "Nombre empresa", "Express Network")}
            {field("billed_to_address", "Direccion", "1605 W. Olympic Blvd., Suite 800...")}
            {field("billed_to_phone", "Telefono", "888-232-6077")}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="self-start px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors mt-2"
        >
          {saved ? "Guardado" : saving ? "Guardando..." : "Guardar Perfil"}
        </button>
      </div>
    </div>
  );
}
