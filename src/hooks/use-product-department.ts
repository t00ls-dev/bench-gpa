import { useEffect } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";

export const PRODUCT_DEPARTMENT_STORAGE_KEY = "bench-gpa:filters:product:department:v1";

export function sanitizeProductDepartment(department: string | null): string | null {
  if (typeof department !== "string") return null;
  const trimmed = department.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useProductDepartment({
  productCode,
  resolvedDepartment,
  isResolved,
}: {
  productCode?: string;
  resolvedDepartment?: string | null;
  isResolved: boolean;
}) {
  const [department, setDepartment] = usePersistentState<string | null>(
    PRODUCT_DEPARTMENT_STORAGE_KEY,
    null,
    sanitizeProductDepartment,
  );

  useEffect(() => {
    if (!productCode || !isResolved) return;
    setDepartment(sanitizeProductDepartment(resolvedDepartment ?? null));
  }, [isResolved, productCode, resolvedDepartment, setDepartment]);

  return [department, setDepartment] as const;
}
