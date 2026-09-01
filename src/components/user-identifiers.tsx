import { cn } from "@/lib/utils";

interface UserIdentifiersProps {
  username: string | null;
  employeeId: string | null;
  className?: string;
}

export function UserIdentifiers({ username, employeeId, className }: UserIdentifiersProps) {
  if (!username && !employeeId) return null;

  const accessibleLabel = [
    username && `Usuário ${username}`,
    employeeId && `Matrícula ${employeeId}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      aria-label={accessibleLabel}
      className={cn("flex max-w-full flex-wrap items-baseline gap-x-1", className)}
    >
      {username && (
        <span aria-hidden="true" className="min-w-0 max-w-full [overflow-wrap:anywhere]">
          {username}
        </span>
      )}
      {employeeId && (
        <span aria-hidden="true" className="min-w-0 max-w-full [overflow-wrap:anywhere]">
          {username && "• "}
          {employeeId}
        </span>
      )}
    </div>
  );
}
