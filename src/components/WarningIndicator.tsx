import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface WarningData {
  id: string;
  warning_type: "yellow_card" | "red_card";
  current_category: string | null;
  evaluation_date: string;
  exam_performance_pct: number | null;
  training_activity_pct: number | null;
  action_plan_due_date: string | null;
  action_plan_notes: string | null;
  resolved: boolean;
}

interface WarningIndicatorProps {
  userId: string;
  /** Show just the icon (for tables) or a full card (for dashboards) */
  variant?: "icon" | "card";
}

/**
 * Shows sárga/piros lap indicators for a user.
 * "icon" variant: small SVG badge for table rows
 * "card" variant: full warning card with details for dashboards
 */
export function WarningIndicator({ userId, variant = "icon" }: WarningIndicatorProps) {
  const [warnings, setWarnings] = useState<WarningData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchWarnings = async () => {
      const { data } = await supabase
        .from("performance_warnings")
        .select("id, warning_type, current_category, evaluation_date, exam_performance_pct, training_activity_pct, action_plan_due_date, action_plan_notes, resolved")
        .eq("user_id", userId)
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      setWarnings((data as WarningData[]) || []);
      setLoaded(true);
    };
    fetchWarnings();
  }, [userId]);

  if (!loaded || warnings.length === 0) return null;

  const yellowCard = warnings.find((w) => w.warning_type === "yellow_card");
  const redCard = warnings.find((w) => w.warning_type === "red_card");
  const activeWarning = redCard || yellowCard;

  if (!activeWarning) return null;

  const isRed = activeWarning.warning_type === "red_card";
  const svgSrc = isRed ? "/badges/!piros_lap.svg" : "/badges/!sarga_lap.svg";
  const label = isRed ? "Piros lap" : "Sárga lap";
  const dueDate = activeWarning.action_plan_due_date
    ? new Date(activeWarning.action_plan_due_date).toLocaleDateString("hu-HU", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // ── Icon variant (compact, for table rows) ──
  if (variant === "icon") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1">
              <img
                src={svgSrc}
                alt={label}
                className="w-5 h-5"
                style={{ objectFit: "contain" }}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px]">
            <p className="font-semibold">{label}</p>
            {activeWarning.current_category && (
              <p className="text-xs text-muted-foreground">
                Kategória: {activeWarning.current_category}
              </p>
            )}
            {dueDate && (
              <p className="text-xs text-muted-foreground">
                Cselekvési terv határideje: {dueDate}
              </p>
            )}
            {activeWarning.exam_performance_pct !== null && (
              <p className="text-xs text-muted-foreground">
                Vizsga: {activeWarning.exam_performance_pct?.toFixed(1)}% · Képzés:{" "}
                {activeWarning.training_activity_pct?.toFixed(1)}%
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ── Card variant (detailed, for dashboards) ──
  const daysLeft = activeWarning.action_plan_due_date
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeWarning.action_plan_due_date).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : null;

  return (
    <Card
      className={`border-2 ${
        isRed
          ? "border-red-500/30 bg-red-500/[0.03]"
          : "border-amber-500/30 bg-amber-500/[0.03]"
      }`}
    >
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-3">
          <img
            src={svgSrc}
            alt={label}
            className="w-10 h-10 flex-shrink-0"
            style={{ objectFit: "contain" }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-sm font-bold ${
                  isRed ? "text-red-600" : "text-amber-600"
                }`}
              >
                {label}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  isRed
                    ? "border-red-500/30 text-red-600"
                    : "border-amber-500/30 text-amber-600"
                }`}
              >
                {isRed ? "Visszaminősítés veszélye" : "Figyelmeztetés"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {activeWarning.exam_performance_pct !== null && (
                <div>
                  <span className="text-muted-foreground">Vizsga: </span>
                  <span className="font-medium">
                    {activeWarning.exam_performance_pct?.toFixed(1)}%
                  </span>
                </div>
              )}
              {activeWarning.training_activity_pct !== null && (
                <div>
                  <span className="text-muted-foreground">Képzés: </span>
                  <span className="font-medium">
                    {activeWarning.training_activity_pct?.toFixed(1)}%
                  </span>
                </div>
              )}
              {dueDate && (
                <div>
                  <span className="text-muted-foreground">Határidő: </span>
                  <span className="font-medium">{dueDate}</span>
                </div>
              )}
              {daysLeft !== null && (
                <div>
                  <span className="text-muted-foreground">Hátralévő: </span>
                  <span
                    className={`font-medium ${
                      daysLeft <= 14 ? (isRed ? "text-red-600" : "text-amber-600") : ""
                    }`}
                  >
                    {daysLeft} nap
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Hook to batch-fetch warning statuses for a list of user IDs.
 * Returns a Map<user_id, warning_type>.
 */
export function useWarningStatuses(userIds: string[]) {
  const [warningMap, setWarningMap] = useState<Map<string, "yellow_card" | "red_card">>(
    new Map()
  );

  useEffect(() => {
    if (userIds.length === 0) return;

    const fetchWarnings = async () => {
      const { data } = await supabase
        .from("performance_warnings")
        .select("user_id, warning_type")
        .eq("resolved", false)
        .in("user_id", userIds);

      const map = new Map<string, "yellow_card" | "red_card">();
      (data || []).forEach((w: any) => {
        const existing = map.get(w.user_id);
        // Red card takes priority over yellow card
        if (!existing || w.warning_type === "red_card") {
          map.set(w.user_id, w.warning_type);
        }
      });
      setWarningMap(map);
    };

    fetchWarnings();
  }, [userIds.join(",")]);

  return warningMap;
}

/**
 * Small inline icon for table rows. Uses the batch-loaded warningMap.
 */
export function WarningIcon({ warningType }: { warningType: "yellow_card" | "red_card" }) {
  const isRed = warningType === "red_card";
  const svgSrc = isRed ? "/badges/!piros_lap.svg" : "/badges/!sarga_lap.svg";
  const label = isRed ? "Piros lap" : "Sárga lap";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <img
            src={svgSrc}
            alt={label}
            className="w-4 h-4 inline-block flex-shrink-0"
            style={{ objectFit: "contain" }}
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs font-medium">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
