/**
 * Copy text on desktop + iOS Safari.
 *
 * `navigator.clipboard.writeText` often fails on iPhone (permissions / gesture
 * timing). Fall back to a temporary textarea + `document.execCommand("copy")`,
 * which works inside a tap handler on iOS.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const value = text ?? "";
  if (!value) return false;

  // Prefer modern API when it works (desktop, some iOS HTTPS)
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through
    }
  }

  return copyWithLegacyExecCommand(value);
}

function copyWithLegacyExecCommand(text: string): boolean {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.setAttribute("aria-hidden", "true");
  // Must stay in the layout tree and roughly on-screen for iOS
  el.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:1px",
    "height:1px",
    "padding:0",
    "margin:0",
    "border:0",
    "outline:none",
    "box-shadow:none",
    "background:transparent",
    "opacity:0.01",
    "font-size:16px",
    "z-index:99999",
  ].join(";");

  document.body.appendChild(el);

  let ok = false;
  try {
    if (isIOS) {
      // iOS-specific selection (setSelectionRange alone is unreliable on some versions)
      el.contentEditable = "true";
      el.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.setSelectionRange(0, text.length);
    } else {
      el.focus();
      el.select();
      el.setSelectionRange(0, text.length);
    }
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(el);
  }
  return ok;
}
