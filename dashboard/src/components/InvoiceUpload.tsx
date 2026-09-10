import { useEffect, useRef, useState } from "react";
import { api, type InvoiceFreelancer } from "../api";

export default function InvoiceUpload({
  invoiceRole,
  onUploaded,
}: {
  invoiceRole: "contador" | "freelancer";
  onUploaded: () => void;
}) {
  const isContador = invoiceRole === "contador";
  const [freelancers, setFreelancers] = useState<InvoiceFreelancer[]>([]);
  const [selectedFreelancer, setSelectedFreelancer] = useState("");
  const [kind, setKind] = useState<"mensual" | "bono">("mensual");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only the contador can list freelancers; a freelancer uploads for themselves.
    if (!isContador) return;
    api
      .listFreelancers()
      .then(setFreelancers)
      .catch((err) => setError(`No se pudieron cargar freelancers: ${(err as Error).message}`));
  }, [isContador]);

  async function handleUpload() {
    if (!xmlFile || !pdfFile) return;
    if (isContador && !selectedFreelancer) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.uploadInvoice({
        xml: xmlFile,
        pdf: pdfFile,
        kind,
        freelancerId: isContador ? selectedFreelancer : undefined,
      });
      setSuccess(`Factura subida: ${res.uuid}`);
      setXmlFile(null);
      setPdfFile(null);
      setKind("mensual");
      if (xmlRef.current) xmlRef.current.value = "";
      if (pdfRef.current) pdfRef.current.value = "";
      onUploaded();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-surface border border-line rounded-lg p-5 mb-6">
      <h3 className="font-semibold text-ink mb-4">Subir Factura</h3>

      {error && (
        <div className="text-body text-danger bg-danger/10 border border-danger/35 rounded-md px-3 py-2 mb-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-body text-ok bg-ok/10 border border-ok/35 rounded-md px-3 py-2 mb-3">
          {success}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Freelancer selector (contador only) */}
        {isContador && (
          <div>
            <label className="block text-meta text-muted mb-1">Freelancer</label>
            <select
              value={selectedFreelancer}
              onChange={(e) => setSelectedFreelancer(e.target.value)}
              className="w-full bg-bg border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent appearance-none"
            >
              <option value="">Seleccionar...</option>
              {freelancers.map((f) => (
                <option key={f.discord_id} value={f.discord_id}>
                  {f.username}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tipo de factura */}
        <div>
          <label className="block text-meta text-muted mb-1">Tipo</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "mensual" | "bono")}
            className="w-full bg-bg border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent appearance-none"
          >
            <option value="mensual">Mensualidad</option>
            <option value="bono">Bono</option>
          </select>
        </div>

        {/* XML file */}
        <div>
          <label className="block text-meta text-muted mb-1">XML Timbrado (CFDI)</label>
          <input
            ref={xmlRef}
            type="file"
            accept=".xml"
            onChange={(e) => setXmlFile(e.target.files?.[0] ?? null)}
            className="w-full text-body text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-raised file:text-muted file:text-meta file:font-medium hover:file:bg-line file:cursor-pointer"
          />
        </div>

        {/* PDF file */}
        <div>
          <label className="block text-meta text-muted mb-1">PDF Timbrado</label>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            className="w-full text-body text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-raised file:text-muted file:text-meta file:font-medium hover:file:bg-line file:cursor-pointer"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={(isContador && !selectedFreelancer) || !xmlFile || !pdfFile || uploading}
          className="tap self-start px-5 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-accent-ink text-body font-medium rounded-md transition-colors"
        >
          {uploading ? "Subiendo..." : "Subir Factura"}
        </button>
      </div>
    </div>
  );
}
