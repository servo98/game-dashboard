import { zipSync } from "fflate";
import { Hono } from "hono";
import { parseCfdiXml } from "../cfdi-parser";
import {
  botSettingsQueries,
  type FreelancerProfile,
  freelancerProfileQueries,
  invoiceItemQueries,
  invoiceQueries,
  panelUserQueries,
  type Session,
} from "../db";
import { generateCommercialPdf } from "../invoice-pdf";
import { requireAdmin, requireApproved, requireAuth, requireInvoiceRole } from "../middleware/auth";

const invoices = new Hono<{
  Variables: {
    session: Session;
    discordId: string;
    role: string;
    invoiceRole: string;
    isBotRequest?: boolean;
  };
}>();

// --- Upload invoice (contador only) ---
invoices.post(
  "/upload",
  requireAuth,
  requireApproved,
  requireInvoiceRole("contador"),
  async (c) => {
    const form = await c.req.formData();
    const xmlFile = form.get("xml") as File | null;
    const pdfFile = form.get("pdf") as File | null;
    const freelancerId = form.get("freelancer_id") as string | null;

    if (!xmlFile || !pdfFile || !freelancerId) {
      return c.json({ error: "xml, pdf, and freelancer_id are required" }, 400);
    }

    // Validate freelancer exists and has role
    const freelancer = panelUserQueries.get.get(freelancerId);
    if (!freelancer || freelancer.invoice_role !== "freelancer") {
      return c.json({ error: "Invalid freelancer" }, 400);
    }

    // Parse CFDI XML
    const xmlText = await xmlFile.text();
    let parsed: ReturnType<typeof parseCfdiXml>;
    try {
      parsed = parseCfdiXml(xmlText);
    } catch (err) {
      return c.json({ error: `XML parse error: ${(err as Error).message}` }, 400);
    }

    // Check for duplicate UUID
    const existing = invoiceQueries.getByUuid.get(parsed.uuid);
    if (existing) {
      return c.json({ error: `Invoice with UUID ${parsed.uuid} already exists` }, 409);
    }

    // Read PDF as buffer
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());

    const uploadedBy = c.get("discordId") as string;

    // Insert invoice
    invoiceQueries.insert.run(
      freelancerId,
      parsed.uuid,
      parsed.emisorRfc,
      parsed.emisorNombre,
      parsed.receptorRfc,
      parsed.receptorNombre,
      parsed.subtotal,
      parsed.total,
      parsed.moneda,
      parsed.formaPago,
      parsed.metodoPago,
      parsed.fechaEmision,
      parsed.fechaTimbrado,
      parsed.selloSat,
      parsed.selloCfdi,
      parsed.noCertificadoSat,
      parsed.cadenaOriginal,
      xmlText,
      pdfBuffer,
      uploadedBy,
    );

    const { id: invoiceId } = invoiceQueries.lastInsertId.get()!;

    // Insert items
    for (const item of parsed.conceptos) {
      invoiceItemQueries.insert.run(
        invoiceId,
        item.claveProdServ,
        item.descripcion,
        item.cantidad,
        item.claveUnidad,
        item.unidad,
        item.valorUnitario,
        item.importe,
        item.objetoImp,
      );
    }

    // Discord notification
    sendInvoiceNotification(parsed.uuid, parsed.total, parsed.moneda, freelancer.username).catch(
      (err) => console.error("Invoice notification error:", err),
    );

    return c.json({ ok: true, id: invoiceId, uuid: parsed.uuid });
  },
);

// --- List invoices ---
invoices.get(
  "/",
  requireAuth,
  requireApproved,
  requireInvoiceRole("contador", "freelancer"),
  (c) => {
    const role = c.get("invoiceRole") as string;
    const discordId = c.get("discordId") as string;

    const list =
      role === "contador"
        ? invoiceQueries.listAll.all()
        : invoiceQueries.listByFreelancer.all(discordId);

    return c.json(list);
  },
);

// --- List freelancers (for contador upload form) ---
invoices.get("/freelancers", requireAuth, requireApproved, requireInvoiceRole("contador"), (c) => {
  const allUsers = panelUserQueries.getAll.all();
  const freelancers = allUsers
    .filter((u) => u.invoice_role === "freelancer")
    .map((u) => ({
      discord_id: u.discord_id,
      username: u.username,
      avatar: u.avatar,
    }));
  return c.json(freelancers);
});

// --- Get single invoice ---
invoices.get(
  "/:id",
  requireAuth,
  requireApproved,
  requireInvoiceRole("contador", "freelancer"),
  (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    const invoice = invoiceQueries.getById.get(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    // Freelancers can only see their own
    const role = c.get("invoiceRole") as string;
    const discordId = c.get("discordId") as string;
    if (role === "freelancer" && invoice.freelancer_discord_id !== discordId) {
      return c.json({ error: "Access denied" }, 403);
    }

    const items = invoiceItemQueries.listByInvoice.all(id);

    return c.json({
      ...invoice,
      timbrado_pdf: undefined, // don't send blob in JSON
      timbrado_xml: undefined,
      items,
    });
  },
);

// --- Download timbrado PDF ---
invoices.get(
  "/:id/timbrado-pdf",
  requireAuth,
  requireApproved,
  requireInvoiceRole("contador", "freelancer"),
  (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    const invoice = invoiceQueries.getById.get(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    const role = c.get("invoiceRole") as string;
    const discordId = c.get("discordId") as string;
    if (role === "freelancer" && invoice.freelancer_discord_id !== discordId) {
      return c.json({ error: "Access denied" }, 403);
    }

    return new Response(new Uint8Array(invoice.timbrado_pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.cfdi_uuid}_timbrado.pdf"`,
      },
    });
  },
);

// --- Generate & download commercial PDF ---
invoices.get(
  "/:id/commercial-pdf",
  requireAuth,
  requireApproved,
  requireInvoiceRole("contador", "freelancer"),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    const invoice = invoiceQueries.getById.get(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    const role = c.get("invoiceRole") as string;
    const discordId = c.get("discordId") as string;
    if (role === "freelancer" && invoice.freelancer_discord_id !== discordId) {
      return c.json({ error: "Access denied" }, 403);
    }

    const profile = freelancerProfileQueries.get.get(invoice.freelancer_discord_id);
    if (!profile) {
      return c.json({ error: "Freelancer profile not configured" }, 400);
    }

    const items = invoiceItemQueries.listByInvoice.all(id);

    const pdfBytes = await generateCommercialPdf(
      {
        cfdiUuid: invoice.cfdi_uuid,
        fechaEmision: invoice.fecha_emision,
        total: invoice.total,
        subtotal: invoice.subtotal,
        moneda: invoice.moneda,
        items,
      },
      profile,
    );

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.cfdi_uuid}_commercial.pdf"`,
      },
    });
  },
);

// --- Download ZIP bundle ---
invoices.get(
  "/:id/bundle",
  requireAuth,
  requireApproved,
  requireInvoiceRole("contador", "freelancer"),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    const invoice = invoiceQueries.getById.get(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    const role = c.get("invoiceRole") as string;
    const discordId = c.get("discordId") as string;
    if (role === "freelancer" && invoice.freelancer_discord_id !== discordId) {
      return c.json({ error: "Access denied" }, 403);
    }

    const profile = freelancerProfileQueries.get.get(invoice.freelancer_discord_id);
    if (!profile) {
      return c.json({ error: "Freelancer profile not configured" }, 400);
    }

    const items = invoiceItemQueries.listByInvoice.all(id);

    const commercialPdf = await generateCommercialPdf(
      {
        cfdiUuid: invoice.cfdi_uuid,
        fechaEmision: invoice.fecha_emision,
        total: invoice.total,
        subtotal: invoice.subtotal,
        moneda: invoice.moneda,
        items,
      },
      profile,
    );

    const zipData = zipSync({
      [`${invoice.cfdi_uuid}_timbrado.pdf`]: new Uint8Array(invoice.timbrado_pdf),
      [`${invoice.cfdi_uuid}_commercial.pdf`]: commercialPdf,
    });

    return new Response(zipData as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="invoice_${invoice.cfdi_uuid}.zip"`,
      },
    });
  },
);

// --- Delete invoice (contador only) ---
invoices.delete("/:id", requireAuth, requireApproved, requireInvoiceRole("contador"), (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const invoice = invoiceQueries.getById.get(id);
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

  invoiceQueries.deleteById.run(id);
  return c.json({ ok: true });
});

// --- Freelancer profile ---
invoices.get("/profile", requireAuth, requireApproved, requireInvoiceRole("freelancer"), (c) => {
  const discordId = c.get("discordId") as string;
  const profile = freelancerProfileQueries.get.get(discordId);
  return c.json(profile ?? null);
});

invoices.put(
  "/profile",
  requireAuth,
  requireApproved,
  requireInvoiceRole("freelancer"),
  async (c) => {
    const discordId = c.get("discordId") as string;
    const body = await c.req.json<Partial<FreelancerProfile>>();
    const user = panelUserQueries.get.get(discordId);

    freelancerProfileQueries.upsert.run(
      discordId,
      body.display_name ?? user?.username ?? "Unknown",
      body.rfc ?? null,
      body.email ?? null,
      body.bank_name ?? null,
      body.account_holder ?? null,
      body.account_number ?? null,
      body.routing_number ?? null,
      body.account_type ?? null,
      body.currency ?? "USD",
      body.billed_to_name ?? null,
      body.billed_to_address ?? null,
      body.billed_to_phone ?? null,
    );

    return c.json({ ok: true });
  },
);

// --- Admin: set invoice role ---
invoices.put("/role/:discordId", requireAuth, requireApproved, requireAdmin, async (c) => {
  const { discordId } = c.req.param();
  const body = await c.req.json<{ invoice_role: string | null }>();
  const valid = [null, "contador", "freelancer"];
  if (!valid.includes(body.invoice_role)) {
    return c.json({ error: "Invalid invoice role. Use: contador, freelancer, or null" }, 400);
  }
  const user = panelUserQueries.get.get(discordId);
  if (!user) return c.json({ error: "User not found" }, 404);

  panelUserQueries.updateInvoiceRole.run(body.invoice_role, discordId);
  return c.json({ ok: true });
});

// --- Discord notification helper ---
async function sendInvoiceNotification(
  uuid: string,
  total: number,
  moneda: string,
  freelancerName: string,
) {
  const channelRow = botSettingsQueries.get.get("invoices_channel_id");
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!channelRow?.value || !botToken) return;

  const embed = {
    title: "Nueva Factura Subida",
    description: `Factura para **${freelancerName}**`,
    color: 3066993,
    fields: [
      { name: "UUID", value: uuid, inline: false },
      {
        name: "Total",
        value: `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${moneda}`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  await fetch(`https://discord.com/api/v10/channels/${channelRow.value}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

export default invoices;
