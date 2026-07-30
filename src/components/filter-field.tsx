import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
