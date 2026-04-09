import { useEffect, useRef, useState } from "react";
import { api, type InvoiceFreelancer } from "../api";

export default function InvoiceUpload({ onUploaded }: { onUploaded: () => void }) {
  const [freelancers, setFreelancers] = useState<InvoiceFreelancer[]>([]);
  const [selectedFreelancer, setSelectedFreelancer] = useState("");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listFreelancers()
      .then(setFreelancers)
      .catch(() => {});
  }, []);

  async function handleUpload() {
    if (!selectedFreelancer || !xmlFile || !pdfFile) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.uploadInvoice(selectedFreelancer, xmlFile, pdfFile);
      setSuccess(`Factura subida: ${res.uuid}`);
      setXmlFile(null);
      setPdfFile(null);
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
      <h3 className="font-semibold text-gray-200 mb-4">Subir Factura</h3>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-green-400 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 mb-3">
          {success}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Freelancer selector */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Freelancer</label>
          <select
            value={selectedFreelancer}
            onChange={(e) => setSelectedFreelancer(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 appearance-none"
          >
            <option value="">Seleccionar...</option>
            {freelancers.map((f) => (
              <option key={f.discord_id} value={f.discord_id}>
                {f.username}
              </option>
            ))}
          </select>
        </div>

        {/* XML file */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">XML Timbrado (CFDI)</label>
          <input
            ref={xmlRef}
            type="file"
            accept=".xml"
            onChange={(e) => setXmlFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-300 file:text-xs file:font-medium hover:file:bg-gray-700 file:cursor-pointer"
          />
        </div>

        {/* PDF file */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">PDF Timbrado</label>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-300 file:text-xs file:font-medium hover:file:bg-gray-700 file:cursor-pointer"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!selectedFreelancer || !xmlFile || !pdfFile || uploading}
          className="self-start px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
        >
          {uploading ? "Subiendo..." : "Subir Factura"}
        </button>
      </div>
    </div>
  );
}
