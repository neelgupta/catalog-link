export type SellerPayment = {
  upiId: string | null;
  upiQrUrl: string | null;
  bank: { accountName: string; accountNumber: string; ifsc: string; bankName?: string; branch?: string } | null;
};

/** How to pay the seller for a chosen payment mode (UPI ID / QR, bank details, or pay later). */
export function PaymentDetails({ mode, payment }: { mode: "PAY_LATER" | "UPI" | "BANK"; payment: SellerPayment }) {
  if (mode === "PAY_LATER") {
    return <p className="text-sm text-stone-600">Pay as per your usual terms with the seller. No payment is needed now.</p>;
  }
  if (mode === "UPI") {
    return (
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {payment.upiQrUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- seller's UPI QR
          <img src={payment.upiQrUrl} alt="Seller's UPI QR code" className="size-36 rounded-lg bg-white object-contain ring-1 ring-stone-200" />
        )}
        <div className="space-y-1">
          {payment.upiId && (
            <p>
              UPI ID: <span className="font-mono font-medium select-all">{payment.upiId}</span>
            </p>
          )}
          <p className="text-stone-600">Pay after the seller confirms your order, and share the payment screenshot on WhatsApp.</p>
        </div>
      </div>
    );
  }
  const b = payment.bank;
  if (!b) return null;
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
      <dt className="text-stone-500">Name</dt>
      <dd className="col-span-2">{b.accountName}</dd>
      <dt className="text-stone-500">Account no.</dt>
      <dd className="col-span-2 font-mono select-all">{b.accountNumber}</dd>
      <dt className="text-stone-500">IFSC</dt>
      <dd className="col-span-2 font-mono select-all">{b.ifsc}</dd>
      {b.bankName && (
        <>
          <dt className="text-stone-500">Bank</dt>
          <dd className="col-span-2">
            {b.bankName}
            {b.branch ? `, ${b.branch}` : ""}
          </dd>
        </>
      )}
      <dd className="col-span-3 pt-1 text-stone-600">Transfer after the seller confirms your order.</dd>
    </dl>
  );
}
