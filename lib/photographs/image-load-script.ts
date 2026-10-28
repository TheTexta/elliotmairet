// Runs in the initial head, before the image markup or React hydration. Native
// images remain visible if scripts are disabled, blocked, or fail to execute.
export const photographImageLoadScript = `(() => {
  const seen = new WeakSet();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function reveal(image) {
    if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-photograph') ||
        !image.complete || !image.naturalWidth || seen.has(image)) return;
    seen.add(image);
    if (!reducedMotion.matches && image.animate) {
      image.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        easing: 'cubic-bezier(0, 0, 0.2, 1)'
      });
    }
  }

  document.addEventListener('load', event => reveal(event.target), true);
  // Cached images and images inserted by client-side navigation may already
  // be complete when they enter the document.
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        reveal(node);
        node.querySelectorAll('img[data-photograph]').forEach(reveal);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  document.querySelectorAll('img[data-photograph]').forEach(reveal);
})();`;
