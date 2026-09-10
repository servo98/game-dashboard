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
    return <div className="text-faint text-body tick py-8 text-center">Cargando facturas...</div>;
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center text-faint py-12">
        <p>No hay facturas todavía.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-ink">Facturas ({invoices.length})</h3>
      {invoices.map((inv) => (
        <div key={inv.id} className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-meta font-mono text-accent">
                {inv.cfdi_uuid.slice(0, 8)}...
              </span>
              <span className="px-2 py-0.5 rounded-full text-meta bg-raised text-muted">
                {inv.status}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-meta ${
                  inv.kind === "bono" ? "bg-warn/15 text-warn" : "bg-raised text-muted"
                }`}
              >
                {inv.kind === "bono" ? "Bono" : "Mensualidad"}
              </span>
            </div>
            <span className="text-body font-semibold text-ink">
              ${inv.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
              <span className="text-meta text-faint">{inv.moneda}</span>
            </span>
          </div>

          <div className="flex items-center gap-4 text-meta text-faint mb-3">
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
              className="tap px-2.5 py-1 bg-raised hover:bg-line rounded-md text-meta text-muted hover:text-ink transition-colors"
            >
              Timbrado
            </a>
            <a
              href={api.commercialPdfUrl(inv.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="tap px-2.5 py-1 bg-raised hover:bg-line rounded-md text-meta text-muted hover:text-ink transition-colors"
            >
              Comercial
            </a>
            <a
              href={api.bundleUrl(inv.id)}
              className="tap px-2.5 py-1 bg-raised hover:bg-line rounded-md text-meta text-muted hover:text-ink transition-colors"
            >
              ZIP
            </a>
            {invoiceRole === "contador" && (
              <button
                onClick={() => handleDelete(inv.id)}
                disabled={deleting === inv.id}
                className="tap px-2.5 py-1 bg-raised hover:bg-line rounded-md text-meta text-muted hover:text-danger transition-colors disabled:opacity-50"
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
