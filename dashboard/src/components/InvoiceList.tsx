import { useCallback, useEffect, useState } from "react";
import { api, type InvoiceSummary } from "../api";

type Props = {
  invoiceRole: "contador" | "freelancer";
  refreshKey?: number;
};

export default function InvoiceList({ invoiceRole, refreshKey }: Props) {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const list = await api.listInvoices();
      setInvoices(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_, refreshKey]);

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await api.deleteInvoice(id);
      await fetch_();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="text-gray-500 text-sm animate-pulse py-8 text-center">
        Cargando facturas...
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center text-gray-600 py-12">
        <p>No hay facturas todavia.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-gray-200">Facturas ({invoices.length})</h3>
      {invoices.map((inv) => (
        <div key={inv.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-brand-400">
                {inv.cfdi_uuid.slice(0, 8)}...
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400">
                {inv.status}
              </span>
            </div>
            <span className="text-sm font-semibold text-white">
              ${inv.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
              <span className="text-xs text-gray-500">{inv.moneda}</span>
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
            <span>Emisor: {inv.emisor_nombre ?? inv.emisor_rfc}</span>
            {inv.fecha_emision && (
              <span>
                {new Date(inv.fecha_emision).toLocaleDateString("es-MX", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          <div className="flex gap-1.5">
            <a
              href={api.timbradoPdfUrl(inv.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              Timbrado
            </a>
            <a
              href={api.commercialPdfUrl(inv.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              Comercial
            </a>
            <a
              href={api.bundleUrl(inv.id)}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              ZIP
            </a>
            {invoiceRole === "contador" && (
              <button
                onClick={() => handleDelete(inv.id)}
                disabled={deleting === inv.id}
                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                {deleting === inv.id ? "..." : "Eliminar"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
