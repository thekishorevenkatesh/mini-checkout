import { createContext, useContext } from "react";

export type PublicStoreHeader = {
  name: string;
  logo?: string;
};

export const PublicStoreHeaderContext = createContext<{
  publicStoreHeader: PublicStoreHeader | null;
  setPublicStoreHeader: (header: PublicStoreHeader | null) => void;
}>({
  publicStoreHeader: null,
  setPublicStoreHeader: () => {},
});

export function usePublicStoreHeader() {
  return useContext(PublicStoreHeaderContext);
}
