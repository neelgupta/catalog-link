"use client";

import { useState } from "react";
import { Button, buttonClass } from "@/components/ui";
import { copyText } from "@/lib/copy-text";

/** Copy, WhatsApp and QR actions for one catalog link. */
export function ShareButtons({ linkId, url, whatsappUrl }: { linkId: string; url: string; whatsappUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qr = (format: "png" | "svg", download = false) =>
    `/api/v1/client/links/${linkId}/qr?format=${format}${download ? "&download=1" : ""}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-3"
          onClick={async () => {
            if (await copyText(url)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } else {
              window.prompt("Copy this link", url);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-lg bg-[#1f8f4e] px-3 text-sm font-medium text-white transition hover:bg-[#187a42]">
          Share on WhatsApp
        </a>
        <Button type="button" variant="secondary" className="h-9 px-3" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
          {showQr ? "Hide QR" : "QR code"}
        </Button>
      </div>
      {showQr && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-stone-200 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG */}
          <img src={qr("svg")} alt="QR code for this link" className="size-36 rounded-lg border border-stone-100" />
          <div className="space-y-2 text-sm">
            <p className="text-stone-600">Print it on visiting cards, bills or your shop counter.</p>
            <div className="flex flex-wrap gap-2">
              <a href={qr("png", true)} className={buttonClass("secondary", "h-9 px-3")} download>
                Download PNG
              </a>
              <a href={qr("svg", true)} className={buttonClass("secondary", "h-9 px-3")} download>
                Download SVG
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
