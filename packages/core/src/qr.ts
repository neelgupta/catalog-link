import QRCode from "qrcode";

const OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#1c1917", light: "#ffffff" } };

/** QR code PNG for a URL, large enough to print on a visiting card or shop counter. */
export function qrPng(url: string) {
  return QRCode.toBuffer(url, { ...OPTIONS, type: "png", width: 1024 });
}

export function qrSvg(url: string) {
  return QRCode.toString(url, { ...OPTIONS, type: "svg" });
}
