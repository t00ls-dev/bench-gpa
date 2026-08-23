import { useEffect, useRef } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

export const PRODUCT_STORE_CODES_STORAGE_KEY = "bench-gpa:filters:product:v1";

export function sanitizeProductStoreCodes(storeCodes: string[]): string[] {
  if (!Array.isArray(storeCodes)) return [];
  return [
    ...new Set(
      storeCodes.filter(
        (storeCode): storeCode is string => typeof storeCode === "string" && storeCode.length > 0,
      ),
    ),
  ];
}

export function useProductStoreCodes(urlStore?: string, clearForDeepLink = false) {
  const [storeCodes, setStoreCodes] = usePersistentState<string[]>(
    PRODUCT_STORE_CODES_STORAGE_KEY,
    [],
    sanitizeProductStoreCodes,
  );
  const appliedUrlStoreRef = useRef(false);

  useEffect(() => {
    if (appliedUrlStoreRef.current || (!urlStore && !clearForDeepLink)) return;
    appliedUrlStoreRef.current = true;
    // Compose with the localStorage hydration queued during the same effect flush.
    setStoreCodes(() => (urlStore ? [urlStore] : []));
  }, [clearForDeepLink, setStoreCodes, urlStore]);

  return [storeCodes, setStoreCodes] as const;
}
