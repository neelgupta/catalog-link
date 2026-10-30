// Order PDF / packing slip (pdfkit) and the orders Excel export (exceljs).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { forClient, prisma } from "@cataloglink/db";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { parseBankDetails } from "../profile";
import { getOrder, type OrderFilters, orderSearchWhere, tabWhere } from "./manage";
import { STATUS_LABEL } from "./status";

const PAYMENT_MODE = { PAY_LATER: "Pay later / credit", UPI: "UPI", BANK: "Bank transfer" } as const;

/** DejaVu Sans has the ₹ sign (pdfkit's built-in fonts don't). Bundled in packages/core/assets/fonts. */
function fontDir() {
  // REPO_ROOT is set by the web app and the worker; import.meta.dirname only exists outside bundles (tests, scripts).
  const candidates = [
    process.env.REPO_ROOT && resolve(process.env.REPO_ROOT, "packages/core/assets/fonts"),
    import.meta.dirname && resolve(import.meta.dirname, "../../assets/fonts"),
  ].filter(Boolean) as string[];
  const dir = candidates.find((d) => existsSync(resolve(d, "DejaVuSans.ttf")));
  if (!dir) throw new Error("PDF fonts not found (packages/core/assets/fonts)");
  return dir;
}

const money = (n: number | { toString(): string }) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n.toString()));

const istDateTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);

export type OrderDocumentKind = "order" | "packing";

/**
 * A4 PDF for one order. "order" is the Purchase Order (PO) slip: buyer, supplier, items with prices,
 * totals and how to pay (`showPrices: false` leaves prices out, for price-hidden links).
 * "packing": items, variants and quantities with tick boxes for packing, no prices.
 */
export async function orderPdf(
  clientId: string,
  orderId: string,
  kind: OrderDocumentKind = "order",
  opts: { showPrices?: boolean } = {},
): Promise<Buffer | null> {
  const prices = kind === "order" && opts.showPrices !== false;
  const [order, client] = await Promise.all([
    getOrder(clientId, orderId),
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { businessName: true, address: true, city: true, gst: true, mobile: true, whatsappNumber: true, upiId: true, bankDetails: true },
    }),
  ]);
  if (!order) return null;

  const fonts = fontDir();
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: kind === "packing" ? `Packing slip ${order.orderNo}` : `Purchase Order ${order.orderNo}`, Author: client.businessName } });
  doc.registerFont("regular", resolve(fonts, "DejaVuSans.ttf"));
  doc.registerFont("bold", resolve(fonts, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const grey = "#57534e";

  // Header: seller on the left, order on the right.
  doc.font("bold").fontSize(16).fillColor("#1c1917").text(client.businessName, left, 40, { width: width * 0.6 });
  doc.font("regular").fontSize(9).fillColor(grey);
  if (client.address) doc.text(client.address, { width: width * 0.6 });
  doc.text(`${client.city} · ${client.whatsappNumber ?? client.mobile}`, { width: width * 0.6 });
  if (client.gst) doc.text(`GSTIN: ${client.gst}`, { width: width * 0.6 });
  const headerBottom = doc.y;
  doc.font("bold").fontSize(13).fillColor("#1c1917").text(kind === "packing" ? "PACKING SLIP" : "PURCHASE ORDER", left, 40, { width, align: "right" });
  doc.font("regular").fontSize(9).fillColor(grey);
  doc.text(kind === "packing" ? `Order #${order.orderNo}` : `PO No. ${order.orderNo}`, { width, align: "right" });
  doc.text(istDateTime(order.createdAt), { width, align: "right" });
  doc.text(`Status: ${STATUS_LABEL[order.status]}`, { width, align: "right" });
  doc.y = Math.max(doc.y, headerBottom) + 14;
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor("#e7e5e4").stroke();
  doc.moveDown(0.8);

  // Customer + delivery.
  const blockTop = doc.y;
  doc.font("bold").fontSize(9).fillColor(grey).text(kind === "packing" ? "SHIP TO" : "BUYER", left, blockTop);
  doc.font("bold").fontSize(10).fillColor("#1c1917").text(`${order.customerName}${order.shopName ? `, ${order.shopName}` : ""}`, { width: width / 2 - 10 });
  doc.font("regular").fontSize(9).fillColor("#1c1917");
  if (order.deliveryAddress) doc.text(order.deliveryAddress, { width: width / 2 - 10 });
  doc.text([order.city, order.mobile].filter(Boolean).join(" · "), { width: width / 2 - 10 });
  if (order.gst) doc.text(`GSTIN: ${order.gst}`, { width: width / 2 - 10 });
  const leftBottom = doc.y;
  doc.font("bold").fontSize(9).fillColor(grey).text("DETAILS", left + width / 2, blockTop);
  doc.font("regular").fontSize(9).fillColor("#1c1917");
  const details = [
    order.transportPref && `Transport: ${order.transportPref}`,
    kind === "order" && `Payment: ${PAYMENT_MODE[order.paymentMode]}${order.paymentReceived ? " (received)" : ""}`,
    order.notes && `Notes: ${order.notes}`,
  ].filter(Boolean) as string[];
  for (const d of details.length ? details : ["—"]) doc.text(d, left + width / 2, doc.y, { width: width / 2 });
  doc.y = Math.max(doc.y, leftBottom) + 16;

  // Items table.
  const cols =
    !prices
      ? [
          { key: "n", label: "#", w: 24, align: "left" as const },
          { key: "item", label: "Item", w: width - 24 - 70 - 60, align: "left" as const },
          { key: "qty", label: "Qty", w: 70, align: "right" as const },
          kind === "packing"
            ? { key: "check", label: "Packed", w: 60, align: "right" as const }
            : { key: "blank", label: "", w: 60, align: "right" as const },
        ]
      : [
          { key: "n", label: "#", w: 24, align: "left" as const },
          { key: "item", label: "Item", w: width - 24 - 70 - 80 - 90, align: "left" as const },
          { key: "qty", label: "Qty", w: 70, align: "right" as const },
          { key: "rate", label: "Rate", w: 80, align: "right" as const },
          { key: "amount", label: "Amount", w: 90, align: "right" as const },
        ];
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y - 4, width, 20).fill("#f5f5f4");
    let x = left;
    doc.font("bold").fontSize(9).fillColor(grey);
    for (const c of cols) {
      doc.text(c.label, x + 4, y + 2, { width: c.w - 8, align: c.align });
      x += c.w;
    }
    doc.y = y + 22;
  };
  drawHeader();
  order.items.forEach((item, i) => {
    const unit = item.priceType === "SET" ? (item.qty === 1 ? "set" : "sets") : item.qty === 1 ? "pc" : "pcs";
    const variant = [item.colour, item.size && `Size ${item.size}`].filter(Boolean).join(" · ");
    const cells: Record<string, string> = {
      n: String(i + 1),
      item: `${item.name}\n${item.sku}${variant ? ` · ${variant}` : ""}`,
      qty: `${item.qty} ${unit}`,
      rate: money(item.unitPrice) + (item.gstPct ? `\n+${Number(item.gstPct)}% GST` : ""),
      amount: money(item.lineTotal),
      check: "",
    };
    const itemCol = cols.find((c) => c.key === "item")!;
    doc.font("regular").fontSize(9);
    const rowH = Math.max(doc.heightOfString(cells.item!, { width: itemCol.w - 8 }), 22) + 8;
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    let x = left;
    for (const c of cols) {
      if (c.key === "blank") {
        // no prices on this copy
      } else if (c.key === "check") doc.rect(x + c.w - 18, y + 2, 12, 12).strokeColor(grey).stroke();
      else doc.fillColor("#1c1917").text(cells[c.key]!, x + 4, y + 2, { width: c.w - 8, align: c.align });
      x += c.w;
    }
    doc.moveTo(left, y + rowH - 2).lineTo(left + width, y + rowH - 2).strokeColor("#e7e5e4").stroke();
    doc.y = y + rowH;
  });

  doc.moveDown(0.6);
  if (kind === "order" && !prices) {
    doc.font("regular").fontSize(9).fillColor(grey).text("Prices and the total will be confirmed by the supplier.", left, doc.y, { width, align: "right" });
  }
  if (prices) {
    const totals: [string, string, boolean][] = [
      ["Subtotal", money(order.subtotal), false],
      ["GST", money(order.gstTotal), false],
      ["Total", money(order.grandTotal), true],
    ];
    for (const [label, value, strong] of totals) {
      const y = doc.y;
      doc.font(strong ? "bold" : "regular").fontSize(strong ? 11 : 9).fillColor("#1c1917");
      doc.text(label, left + width - 250, y, { width: 150, align: "right" });
      doc.text(value, left + width - 100, y, { width: 100, align: "right" });
      doc.y = y + (strong ? 18 : 14);
    }
    const bank = parseBankDetails(client.bankDetails);
    const pay = [
      order.paymentMode === "UPI" && client.upiId && `UPI ID: ${client.upiId}`,
      order.paymentMode === "BANK" && bank && `Bank: ${bank.accountName}, A/c ${bank.accountNumber}, IFSC ${bank.ifsc}${bank.bankName ? `, ${bank.bankName}` : ""}`,
    ].filter(Boolean) as string[];
    if (pay.length) {
      doc.moveDown(1);
      doc.font("bold").fontSize(9).fillColor(grey).text("PAYMENT DETAILS", left);
      doc.font("regular").fontSize(9).fillColor("#1c1917");
      for (const p of pay) doc.text(p, left);
    }
  } else {
    const pieces = order.items.reduce((n, i) => n + i.qty, 0);
    doc.font("bold").fontSize(10).fillColor("#1c1917").text(`${order.items.length} item${order.items.length === 1 ? "" : "s"} · ${pieces} total`, left, doc.y, { width, align: "right" });
  }

  doc.font("regular").fontSize(8).fillColor("#a8a29e").text(`Generated by CatalogLink · ${istDateTime(new Date())}`, left, doc.page.height - 50, { width, align: "center" });
  doc.end();
  return done;
}

/** Orders export: one row per item, with the order's details repeated, for the current filters. */
export async function ordersWorkbook(clientId: string, filters: OrderFilters): Promise<Buffer> {
  const orders = await forClient(clientId).order.findMany({
    where: { ...orderSearchWhere(filters), ...tabWhere(filters.tab) },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { items: { orderBy: { id: "asc" } } },
  });
  const wb = new ExcelJS.Workbook();
  wb.creator = "CatalogLink";
  const ws = wb.addWorksheet("Orders", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Order No", key: "orderNo", width: 10 },
    { header: "Date", key: "date", width: 20 },
    { header: "Status", key: "status", width: 12 },
    { header: "Customer", key: "customer", width: 22 },
    { header: "Shop", key: "shop", width: 22 },
    { header: "Mobile", key: "mobile", width: 13 },
    { header: "City", key: "city", width: 14 },
    { header: "Address", key: "address", width: 36 },
    { header: "GSTIN", key: "gst", width: 17 },
    { header: "SKU", key: "sku", width: 12 },
    { header: "Product", key: "product", width: 28 },
    { header: "Colour", key: "colour", width: 12 },
    { header: "Size", key: "size", width: 8 },
    { header: "Qty", key: "qty", width: 7 },
    { header: "Unit", key: "unit", width: 6 },
    { header: "Unit Price", key: "unitPrice", width: 11, style: { numFmt: "#,##0.00" } },
    { header: "GST %", key: "gstPct", width: 7 },
    { header: "Line Total", key: "lineTotal", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Order Total", key: "orderTotal", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Payment Mode", key: "payment", width: 16 },
    { header: "Payment Received", key: "paid", width: 10 },
    { header: "Transport", key: "transport", width: 18 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const o of orders) {
    for (const i of o.items) {
      ws.addRow({
        orderNo: o.orderNo,
        date: istDateTime(o.createdAt),
        status: STATUS_LABEL[o.status],
        customer: o.customerName,
        shop: o.shopName ?? "",
        mobile: o.mobile,
        city: o.city ?? "",
        address: o.deliveryAddress,
        gst: o.gst ?? "",
        sku: i.sku,
        product: i.name,
        colour: i.colour ?? "",
        size: i.size ?? "",
        qty: i.qty,
        unit: i.priceType === "SET" ? "set" : "pc",
        unitPrice: Number(i.unitPrice),
        gstPct: i.gstPct ? Number(i.gstPct) : "",
        lineTotal: Number(i.lineTotal),
        orderTotal: Number(o.grandTotal),
        payment: PAYMENT_MODE[o.paymentMode],
        paid: o.paymentReceived ? "Yes" : "No",
        transport: o.transportPref ?? "",
        notes: o.notes ?? "",
      });
    }
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
