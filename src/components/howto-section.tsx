import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function HowToSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="kpi-card mb-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="size-5 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}
