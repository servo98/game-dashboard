import { XMLParser } from "fast-xml-parser";

export type ParsedCfdi = {
  uuid: string;
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  subtotal: number;
  total: number;
  moneda: string;
  formaPago: string | null;
  metodoPago: string | null;
  fechaEmision: string | null;
  fechaTimbrado: string | null;
  selloSat: string | null;
  selloCfdi: string | null;
  noCertificadoSat: string | null;
  cadenaOriginal: string | null;
  conceptos: ParsedConcepto[];
};

export type ParsedConcepto = {
  claveProdServ: string | null;
  descripcion: string;
  cantidad: number;
  claveUnidad: string | null;
  unidad: string | null;
  valorUnitario: number;
  importe: number;
  objetoImp: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

export function parseCfdiXml(xml: string): ParsedCfdi {
  const doc = parser.parse(xml);

  // The root element is Comprobante (namespace prefix removed)
  const comp = doc.Comprobante;
  if (!comp) {
    throw new Error("Invalid CFDI XML: missing Comprobante root element");
  }

  const emisor = comp.Emisor;
  const receptor = comp.Receptor;

  if (!emisor || !receptor) {
    throw new Error("Invalid CFDI XML: missing Emisor or Receptor");
  }

  // Parse conceptos - can be single object or array
  const conceptosRaw = comp.Conceptos?.Concepto;
  const conceptosArr = Array.isArray(conceptosRaw)
    ? conceptosRaw
    : conceptosRaw
      ? [conceptosRaw]
      : [];

  const conceptos: ParsedConcepto[] = conceptosArr.map((c: Record<string, string>) => ({
    claveProdServ: c["@_ClaveProdServ"] ?? null,
    descripcion: c["@_Descripcion"] ?? c["@_descripcion"] ?? "",
    cantidad: Number.parseFloat(c["@_Cantidad"] ?? "1"),
    claveUnidad: c["@_ClaveUnidad"] ?? null,
    unidad: c["@_Unidad"] ?? null,
    valorUnitario: Number.parseFloat(c["@_ValorUnitario"] ?? "0"),
    importe: Number.parseFloat(c["@_Importe"] ?? "0"),
    objetoImp: c["@_ObjetoImp"] ?? null,
  }));

  // Parse TimbreFiscalDigital from Complemento
  const complemento = comp.Complemento;
  const timbre = complemento?.TimbreFiscalDigital;

  const uuid = timbre?.["@_UUID"] ?? "";
  if (!uuid) {
    throw new Error("Invalid CFDI XML: missing UUID in TimbreFiscalDigital");
  }

  return {
    uuid: uuid.toUpperCase(),
    emisorRfc: emisor["@_Rfc"] ?? "",
    emisorNombre: emisor["@_Nombre"] ?? "",
    receptorRfc: receptor["@_Rfc"] ?? "",
    receptorNombre: receptor["@_Nombre"] ?? "",
    subtotal: Number.parseFloat(comp["@_SubTotal"] ?? "0"),
    total: Number.parseFloat(comp["@_Total"] ?? "0"),
    moneda: comp["@_Moneda"] ?? "MXN",
    formaPago: comp["@_FormaPago"] ?? null,
    metodoPago: comp["@_MetodoPago"] ?? null,
    fechaEmision: comp["@_Fecha"] ?? null,
    fechaTimbrado: timbre?.["@_FechaTimbrado"] ?? null,
    selloSat: timbre?.["@_SelloSAT"] ?? null,
    selloCfdi: timbre?.["@_SelloCFD"] ?? null,
    noCertificadoSat: timbre?.["@_NoCertificadoSAT"] ?? null,
    cadenaOriginal: null, // cadena original is not in the XML itself, computed externally
    conceptos,
  };
}
