import { type ReactNode, createContext, useContext, useMemo, useState } from "react";
import { type Catalog, type UploadedClip, buildCatalog } from "./catalog";

type Ctx = {
  catalog: Catalog;
  uploaded: UploadedClip[];
  setUploaded: (clips: UploadedClip[]) => void;
};

const CatalogContext = createContext<Ctx | null>(null);

export function useCatalog(): Ctx {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog outside CatalogProvider");
  return ctx;
}

/**
 * Bundled + uploaded clips for the controller. Seeded by the loader so the
 * first paint already has every card; afterwards the room's pushes and the
 * editor's own API responses keep it current.
 */
export function CatalogProvider({
  initial,
  children,
}: { initial: UploadedClip[]; children: ReactNode }) {
  const [uploaded, setUploaded] = useState(initial);
  const value = useMemo(
    () => ({ catalog: buildCatalog(uploaded), uploaded, setUploaded }),
    [uploaded],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
