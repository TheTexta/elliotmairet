"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Confirmation = { title: string; description: string; confirmLabel?: string; destructive?: boolean };
const ConfirmationContext = createContext<((options: Confirmation) => Promise<boolean>) | null>(null);

export function AdminConfirmBoundary({ children }: { children: ReactNode }) {
  // Admin layouts persist across routes. Remount the decision scope when the
  // requesting page leaves, including browser Back/Forward navigation.
  const pathname = usePathname();
  return <AdminConfirmProvider key={pathname}>{children}</AdminConfirmProvider>;
}

export function AdminConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; resolver.current?.(false); resolver.current = null; };
  }, []);
  const confirm = useCallback((options: Confirmation) => {
    // Never overwrite an outstanding decision or continue after navigation.
    if (!mounted.current || resolver.current) return Promise.resolve(false);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise<boolean>(resolve => { resolver.current = resolve; setRequest(options); });
  }, []);
  function finish(confirmed: boolean) {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }
  return <ConfirmationContext.Provider value={confirm}>
    {children}
    <AlertDialog open={request !== null} onOpenChange={open => { if (!open) finish(false); }}>
      <AlertDialogContent onCloseAutoFocus={event => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={() => finish(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" variant={request?.destructive ? "destructive" : "default"} onClick={() => finish(true)}>{request?.confirmLabel ?? "Continue"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </ConfirmationContext.Provider>;
}

export function useAdminConfirm() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("Admin confirmations require AdminConfirmProvider.");
  return confirm;
}
