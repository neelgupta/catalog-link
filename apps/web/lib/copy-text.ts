/**
 * Copies text from a click handler. navigator.clipboard only exists on https pages (and localhost), so
 * on a phone opening the dev server by IP it falls back to the older execCommand("copy").
 * Returns false when the browser refused both, so the caller can show the text to copy by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* permission denied: try the fallback */
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off screen, and 16px so iOS doesn't zoom in when it is focused.
  Object.assign(area.style, { position: "fixed", top: "0", left: "-9999px", fontSize: "16px", opacity: "0" });
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length); // iOS ignores select() alone
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
