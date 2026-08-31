"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { createBrowserClient } from "@supabase/ssr";
import { Badge } from "@/components/ui/badge";

type OrderEvent = {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  metadata: any;
};

export function OrderTimelineModal({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (orderId && open) {
      setLoading(true);
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      supabase
        .from("order_events")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) setEvents(data);
          setLoading(false);
        });
    } else {
      setEvents([]);
    }
  }, [orderId, open]);

  const getEventColor = (type: string) => {
    switch (type) {
      case "SYNCED": return "bg-blue-500";
      case "FRAUD_CHECK": return "bg-purple-500";
      case "DISPATCHED": return "bg-green-500";
      case "SMS_SENT": return "bg-yellow-500";
      case "STATUS_CHANGE": return "bg-gray-500";
      default: return "bg-gray-400";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order Timeline</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground my-8">Loading timeline...</p>
          ) : events.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground my-8">No events recorded.</p>
          ) : (
            <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              {events.map((event) => (
                <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow flex-shrink-0 ${getEventColor(event.event_type)}`}>
                     <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-card p-4 rounded border shadow">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">{event.event_type}</Badge>
                      <time className="text-xs text-muted-foreground">{format(new Date(event.created_at), "MMM d, h:mm a")}</time>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {event.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
