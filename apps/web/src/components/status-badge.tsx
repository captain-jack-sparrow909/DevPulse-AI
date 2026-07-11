import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn(STATUS_COLORS[status] || STATUS_COLORS.draft)}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}
