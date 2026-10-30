// Writes orders to an "Orders" tab in the client's Google Sheet (when switched on in Settings).
// One row per order item; on later changes only the payment and status cells are rewritten.
import { prisma } from "@cataloglink/db";
import { type CellValue, type GoogleSource, GOOGLE_ERROR_MESSAGES, toGoogleError } from "../google/source";
import { parseClientSettings } from "../profile";
import { STATUS_LABEL } from "./status";

export const ORDERS_TAB = "Orders";
export const ORDER_SHEET_HEADERS = [
  "Order No",
  "Date",
  "Customer",
  "Shop",
  "Mobile",
  "City",
  "SKU",
  "Product",
  "Colour",
  "Size",
  "Qty",
  "Unit Price",
  "Line Total",
  "Order Total",
  "Payment Mode",
  "Payment Received",
  "Status",
];
const PAYMENT_COL = ORDER_SHEET_HEADERS.indexOf("Payment Received");
const PAYMENT_MODE = { PAY_LATER: "Pay later", UPI: "UPI", BANK: "Bank transfer" } as const;

/** "Q" for column index 16. */
const column = (index: number) => {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const istDateTime = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(d)
    .replace(",", "");

export type SheetWriteResult = "appended" | "updated" | "skipped";

/**
 * Writes one order (or its new status) to the Orders tab. Records success or the error on the order;
 * errors are rethrown so the queue retries. Never touches the products tab.
 */
export async function writeOrderToSheet(orderId: string, source: GoogleSource | (() => GoogleSource)): Promise<SheetWriteResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      client: { select: { settings: true, sheetConnection: { select: { spreadsheetId: true, sheetName: true } } } },
    },
  });
  const conn = order?.client.sheetConnection;
  if (!order || !conn?.spreadsheetId || !parseClientSettings(order.client.settings).writeOrdersTab) return "skipped";
  // Never write into the products tab, even if it happens to be called "Orders".
  const tab = conn.sheetName === ORDERS_TAB ? "CatalogLink Orders" : ORDERS_TAB;

  try {
    const google = typeof source === "function" ? source() : source;
    await google.ensureTab(conn.spreadsheetId, tab, ORDER_SHEET_HEADERS);
    const rows = await google.readValues(conn.spreadsheetId, tab);
    const orderNo = String(order.orderNo);
    const existing = rows.map((r, i) => (i > 0 && r[0] === orderNo ? i : -1)).filter((i) => i > 0);
    const payment = order.paymentReceived ? "Yes" : "No";
    const status = STATUS_LABEL[order.status];

    let result: SheetWriteResult;
    if (existing.length) {
      const range = (row: number) => `${column(PAYMENT_COL)}${row + 1}:${column(PAYMENT_COL + 1)}${row + 1}`;
      await google.updateCells(conn.spreadsheetId, tab, existing.map((row) => ({ range: range(row), values: [[payment, status]] })));
      result = "updated";
    } else {
      const date = istDateTime(order.createdAt);
      const rowsToAdd: CellValue[][] = order.items.map((i) => [
        orderNo,
        date,
        order.customerName,
        order.shopName ?? "",
        order.mobile,
        order.city ?? "",
        i.sku,
        i.name,
        i.colour ?? "",
        i.size ?? "",
        i.qty,
        Number(i.unitPrice),
        Number(i.lineTotal),
        Number(order.grandTotal),
        PAYMENT_MODE[order.paymentMode],
        payment,
        status,
      ]);
      await google.appendRows(conn.spreadsheetId, tab, rowsToAdd);
      result = "appended";
    }
    await prisma.order.update({ where: { id: orderId }, data: { sheetWrittenAt: new Date(), sheetError: null } });
    return result;
  } catch (err) {
    const g = toGoogleError(err);
    const message =
      g.kind === "no_access"
        ? "CatalogLink can't write to your sheet. Reconnect your Google account (allow Google Sheets access)."
        : GOOGLE_ERROR_MESSAGES[g.kind];
    await prisma.order.update({ where: { id: orderId }, data: { sheetError: message } }).catch(() => undefined);
    throw err;
  }
}
