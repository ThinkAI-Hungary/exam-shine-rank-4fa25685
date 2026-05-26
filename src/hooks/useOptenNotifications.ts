import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook that subscribes to company_monitoring changes via Supabase Realtime.
 * Shows a toast notification when an employee count change is detected.
 * Only activates for admin users.
 */
export function useOptenNotifications(isAdmin: boolean) {
  const { toast } = useToast();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    // Subscribe to UPDATE events on company_monitoring
    const channel = supabase
      .channel("opten-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "company_monitoring",
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          // Only notify if employee count actually changed
          if (
            oldRow.current_employee_count !== null &&
            newRow.current_employee_count !== null &&
            oldRow.current_employee_count !== newRow.current_employee_count
          ) {
            const diff = newRow.current_employee_count - oldRow.current_employee_count;
            const direction = diff > 0 ? "növekedett" : "csökkent";
            const arrow = diff > 0 ? "📈" : "📉";

            toast({
              title: `${arrow} ${newRow.company_name}`,
              description: `Létszám ${direction}: ${oldRow.current_employee_count} → ${newRow.current_employee_count} (${diff > 0 ? "+" : ""}${diff} fő)`,
              duration: 10000,
            });

            // Also try native browser notification if permission granted
            if (Notification.permission === "granted") {
              try {
                new Notification(`OPTEN: ${newRow.company_name}`, {
                  body: `Létszám ${direction}: ${oldRow.current_employee_count} → ${newRow.current_employee_count}`,
                  icon: "/favicon.ico",
                  tag: `opten-${newRow.id}`,
                });
              } catch {
                // Browser notification not supported in this context
              }
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Request browser notification permission (non-blocking)
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAdmin, toast]);
}
