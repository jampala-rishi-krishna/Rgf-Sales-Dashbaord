import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Wraps a (disabled) control so the reason is discoverable on hover and keyboard focus. */
export function DisabledReason({
  disabled,
  reason,
  children,
}: {
  disabled: boolean;
  reason?: string;
  children: ReactNode;
}) {
  if (!disabled || !reason) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Span wrapper: disabled buttons do not fire pointer events. */}
          <span
            tabIndex={0}
            className="inline-flex cursor-not-allowed rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={reason}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
