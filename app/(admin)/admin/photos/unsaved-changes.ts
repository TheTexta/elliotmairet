"use client";

import { useEffect } from "react";

const unsaved = new Map<symbol, boolean>();
let guardedLocation = "";
let guardedHistoryState: unknown;
let guardedHistoryIndex: number | undefined;
let historyGuardInstalled = false;

export function installAdminHistoryGuard() {
  if (historyGuardInstalled) return;
  window.addEventListener("popstate", beforeHistoryNavigation, true);
  historyGuardInstalled = true;
}

export function hasUnsavedAdminChanges() { return unsaved.size > 0; }

export function confirmAdminNavigation(message = "You have unsaved changes or an unfinished operation. Leave this page?") {
  if ([...unsaved.values()].some(Boolean)) return false;
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

function beforeHistoryNavigation(event: PopStateEvent) {
  if (!unsaved.size) return;
  const destination = new URL(window.location.href);
  const current = new URL(guardedLocation);
  if (destination.pathname === current.pathname && destination.search === current.search) return;
  if (confirmAdminNavigation()) return;
  // popstate cannot be cancelled. Stop the App Router before it unmounts the
  // editor, then traverse back to the working entry without losing Forward.
  event.stopImmediatePropagation();
  const index = window.navigation?.currentEntry?.index;
  if (guardedHistoryIndex !== undefined && index !== undefined && index !== guardedHistoryIndex) {
    window.history.go(guardedHistoryIndex - index);
  } else {
    // Older browsers expose no history position. Preserve the form and Next's
    // own state, even though restoring it this way replaces the Forward branch.
    window.history.pushState(guardedHistoryState, "", guardedLocation);
  }
}

export function useUnsavedChanges(dirty: boolean, blockNavigation = false) {
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol();
    unsaved.set(key, blockNavigation);
    if (unsaved.size === 1) {
      guardedLocation = window.location.href;
      guardedHistoryState = window.history.state;
      guardedHistoryIndex = window.navigation?.currentEntry?.index;
      window.addEventListener("beforeunload", beforeUnload);
      installAdminHistoryGuard();
      document.addEventListener("click", beforeNavigation, true);
    }
    return () => {
      unsaved.delete(key);
      if (!unsaved.size) {
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("click", beforeNavigation, true);
      }
    };
  }, [dirty, blockNavigation]);
}
