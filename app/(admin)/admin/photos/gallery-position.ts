const positionKey = "elliot-admin-gallery-position";

export function rememberGalleryPosition(href: string, id?: string, count = 48) {
  try { window.sessionStorage.setItem(positionKey, JSON.stringify({ href, id, count, y: window.scrollY })); }
  catch { /* Storage may be disabled; URL context and native Back still work. */ }
}

export function restoreGalleryPosition(href: string, reveal?: (count: number) => void) {
  let frame = 0;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(positionKey) ?? "null");
    if (saved?.href !== href || !Number.isFinite(saved.y) || saved.y < 0) return;
    if (Number.isSafeInteger(saved.count) && saved.count > 0) reveal?.(saved.count);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        window.scrollTo(0, saved.y);
        if (typeof saved.id === "string") document.getElementById(`photograph-${saved.id}`)?.focus({ preventScroll: true });
        window.sessionStorage.removeItem(positionKey);
      });
    });
  } catch { /* Gallery navigation must work without session storage. */ }
  return () => cancelAnimationFrame(frame);
}
