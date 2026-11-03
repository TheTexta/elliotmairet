"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminHeader } from "./admin-header";

const UploadNavigation = createContext<null | { setUploadBusy: (busy: boolean) => void }>(null);

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const [uploadBusy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const setUploadBusy = useCallback((busy: boolean) => {
    busyRef.current = busy;
    setBusy(busy);
  }, []);
  const canLeave = useCallback(() => !busyRef.current, []);
  const value = useMemo(() => ({ setUploadBusy }), [setUploadBusy]);
  return <UploadNavigation.Provider value={value}>
    <AdminHeader uploading={uploadBusy} canLeave={canLeave} />
    {children}
  </UploadNavigation.Provider>;
}

export function useAdminUploadNavigation() {
  const context = useContext(UploadNavigation);
  if (!context) throw new Error("Upload must be inside the admin workspace.");
  return context;
}
