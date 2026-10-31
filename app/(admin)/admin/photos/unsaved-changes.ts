"use client";

import { useEffect } from "react";

const unsaved = new Set<symbol>();

export function confirmAdminNavigation(message = "You have unsaved changes or an unfinished operation. Leave this page?") {
  return !unsaved.size || window.confirm(message);
}

function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function beforeNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.download || link.target === "_blank") return;
  const destination = new URL(link.href, window.location.href);
  if (destination.href === window.location.href || (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash)) return;
  if (!confirmAdminNavigation()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol();
    unsaved.add(key);
    if (unsaved.size === 1) {
      window.addEventListener("beforeunload", beforeUnload);
      document.addEventListener("click", beforeNavigation, true);
    }
    return () => {
      unsaved.delete(key);
      if (!unsaved.size) {
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("click", beforeNavigation, true);
      }
    };
  }, [dirty]);
}
