import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { FreelancerProfile, InvoiceItem } from "./db";

type InvoiceData = {
  cfdiUuid: string;
  fechaEmision: string | null;
  total: number;
  subtotal: number;
  moneda: string;
  items: InvoiceItem[];
};

export async function generateCommercialPdf(
  invoice: InvoiceData,
  profile: FreelancerProfile,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // Letter size
  const { height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const darkGray = rgb(0.2, 0.2, 0.2);

  const leftMargin = 50;
  const rightEdge = 562;
  let y = height - 50;

  // --- Header: INVOICE ---
  page.drawText("INVOICE", { x: leftMargin, y, size: 32, font: fontBold, color: darkGray });
  y -= 25;

  // UUID and date
  page.drawText(invoice.cfdiUuid, { x: leftMargin, y, size: 9, font, color: gray });
  const dateStr = formatDate(invoice.fechaEmision);
  const dateWidth = fontBold.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, {
    x: rightEdge - dateWidth,
    y,
    size: 10,
    font: fontBold,
    color: darkGray,
  });
  y -= 40;

  // --- Decorative top bar ---
  page.drawRectangle({
    x: rightEdge - 60,
    y: height - 50,
    width: 20,
    height: 70,
    color: lightGray,
  });
  page.drawRectangle({
    x: rightEdge - 35,
    y: height - 50,
    width: 10,
    height: 70,
    color: rgb(0.92, 0.92, 0.92),
  });

  // --- BILLED TO ---
  page.drawText("BILLED TO:", { x: leftMargin, y, size: 11, font: fontBold, color: black });
  y -= 18;

  if (profile.billed_to_name) {
    page.drawText(profile.billed_to_name, { x: leftMargin, y, size: 10, font, color: black });
    y -= 15;
  }
  if (profile.billed_to_address) {
    // Split address into lines if it contains commas
    const addressLines = profile.billed_to_address.split("\n");
    for (const line of addressLines) {
      page.drawText(line.trim(), { x: leftMargin, y, size: 10, font, color: black });
      y -= 15;
    }
  }
  if (profile.billed_to_phone) {
    page.drawText(profile.billed_to_phone, { x: leftMargin, y, size: 10, font, color: black });
    y -= 15;
  }
  y -= 25;

  // --- Items table header ---
  const colTask = leftMargin;
  const colRate = 320;
  const colHours = 420;
  const colTotal = 500;

  // Header line
  page.drawLine({
    start: { x: leftMargin, y: y + 5 },
    end: { x: rightEdge, y: y + 5 },
    thickness: 1,
    color: black,
  });

  page.drawText("TASK", { x: colTask, y: y - 10, size: 9, font: fontBold, color: black });
  page.drawText("RATE", { x: colRate, y: y - 10, size: 9, font: fontBold, color: black });
  page.drawText("HOURS", { x: colHours, y: y - 10, size: 9, font: fontBold, color: black });
  page.drawText("TOTAL", { x: colTotal, y: y - 10, size: 9, font: fontBold, color: black });
  y -= 15;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightEdge, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 15;

  // Items
  for (const item of invoice.items) {
    // Wrap description if too long
    const desc = item.descripcion;
    const descLines = wrapText(desc, 40);

    for (let i = 0; i < descLines.length; i++) {
      page.drawText(descLines[i], {
        x: colTask,
        y,
        size: 10,
        font: i === 0 ? fontBold : font,
        color: black,
      });
      if (i > 0) y -= 14;
    }

    page.drawText("Fixed Fee", {
      x: colRate,
      y: y + (descLines.length > 1 ? 14 * (descLines.length - 1) : 0),
      size: 10,
      font,
      color: black,
    });
    page.drawText(String(item.cantidad), {
      x: colHours + 15,
      y: y + (descLines.length > 1 ? 14 * (descLines.length - 1) : 0),
      size: 10,
      font,
      color: black,
    });
    const totalStr = formatCurrency(item.importe, invoice.moneda);
    const totalW = font.widthOfTextAtSize(totalStr, 10);
    page.drawText(totalStr, {
      x: rightEdge - totalW,
      y: y + (descLines.length > 1 ? 14 * (descLines.length - 1) : 0),
      size: 10,
      font,
      color: black,
    });

    y -= 20;
  }

  // --- TOTAL DUE ---
  y -= 10;
  const totalDueLabel = "TOTAL DUE:";
  const totalDueValue = formatCurrency(invoice.total, invoice.moneda);
  page.drawText(totalDueLabel, { x: leftMargin, y, size: 11, font: fontBold, color: black });
  page.drawText(totalDueValue, {
    x: leftMargin + fontBold.widthOfTextAtSize(totalDueLabel, 11) + 10,
    y,
    size: 11,
    font: fontBold,
    color: black,
  });

  page.drawLine({
    start: { x: leftMargin, y: y - 8 },
    end: { x: rightEdge, y: y - 8 },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 40;

  // --- PAYMENT INFORMATION ---
  page.drawText("PAYMENT INFORMATION:", {
    x: leftMargin,
    y,
    size: 10,
    font: fontBold,
    color: black,
  });
  y -= 18;

  const paymentLines = [
    "Bank Transfer (ACH or Wire)",
    `Beneficiary: ${profile.account_holder ?? profile.display_name}`,
    `Bank: ${profile.bank_name ?? "N/A"}`,
    `Account Number: ${profile.account_number ?? "N/A"}`,
    `Routing (ABA): ${profile.routing_number ?? "N/A"}`,
    `Account Type: ${profile.account_type ?? "Checking"}`,
    `Currency: ${profile.currency ?? "USD"}`,
  ];

  for (const line of paymentLines) {
    page.drawText(line, { x: leftMargin, y, size: 10, font, color: black });
    y -= 15;
  }

  // Payment reference
  y -= 10;
  page.drawText("Payment reference:", { x: leftMargin, y, size: 10, font: fontBold, color: black });
  y -= 15;

  // Derive month/year from first item description or date
  const refText = derivePaymentReference(invoice);
  page.drawText(refText, { x: leftMargin, y, size: 10, font, color: black });
  y -= 25;

  // Domestic transfer note
  page.drawText("Domestic USD transfer (ACH or Wire).", {
    x: leftMargin,
    y,
    size: 12,
    font: fontBold,
    color: black,
  });
  y -= 18;
  page.drawText("Do not send as international wire.", {
    x: leftMargin,
    y,
    size: 12,
    font: fontBold,
    color: black,
  });

  // --- Footer ---
  const footerY = 50;

  // Footer line
  page.drawLine({
    start: { x: leftMargin, y: footerY + 20 },
    end: { x: rightEdge, y: footerY + 20 },
    thickness: 0.5,
    color: lightGray,
  });

  page.drawText(profile.account_holder ?? profile.display_name, {
    x: leftMargin,
    y: footerY,
    size: 10,
    font,
    color: black,
  });

  if (profile.email) {
    const emailW = font.widthOfTextAtSize(profile.email, 10);
    page.drawText(profile.email, {
      x: rightEdge - emailW,
      y: footerY,
      size: 10,
      font,
      color: black,
    });
  }

  // Disclaimer
  const disclaimer =
    '"This is a commercial invoice for client records. Official Mexican CFDI has been issued separately."';
  const discW = fontItalic.widthOfTextAtSize(disclaimer, 8);
  page.drawText(disclaimer, {
    x: (612 - discW) / 2,
    y: footerY - 15,
    size: 8,
    font: fontItalic,
    color: gray,
  });

  return doc.save();
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === "MXN" ? "$" : "$";
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr)
    return new Date()
      .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })
      .toUpperCase();
  const d = new Date(dateStr);
  return d
    .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })
    .toUpperCase();
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function derivePaymentReference(invoice: InvoiceData): string {
  // Try to extract month from item description (e.g., "services (FEBRUARY 2026)")
  const desc = invoice.items[0]?.descripcion ?? "";
  const monthMatch = desc.match(/\((\w+\s+\d{4})\)/i);
  if (monthMatch) {
    return `Software development services – ${monthMatch[1]}`;
  }
  // Fallback to emission date
  if (invoice.fechaEmision) {
    const d = new Date(invoice.fechaEmision);
    const month = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return `Software development services – ${month}`;
  }
  return `Invoice ${invoice.cfdiUuid}`;
}
