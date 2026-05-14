import { SearchX } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export function EmptyState({
  icon,
  title = "Nincs találat",
  description = "Próbáld módosítani a keresési feltételeket.",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-1">
        {icon || <SearchX className="w-7 h-7 opacity-60" />}
      </div>
      <p className="text-base font-medium text-foreground/70">{title}</p>
      <p className="text-sm max-w-xs text-center">{description}</p>
    </div>
  );
}
