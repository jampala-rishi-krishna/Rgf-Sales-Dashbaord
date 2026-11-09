import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConfirmSendDialog({
  open,
  onOpenChange,
  channelLabel,
  count,
  sampleCompanies,
  onConfirm,
  requireTypedCount = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelLabel: string;
  count: number;
  sampleCompanies: string[];
  onConfirm: () => void | Promise<void>;
  requireTypedCount?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const validCount = Number.isFinite(count) && count >= 1;
  const typedOk = !requireTypedCount || typed.trim() === String(count);
  const canConfirm = validCount && typedOk && !busy;
  const sample = sampleCompanies.slice(0, 5);

  async function go() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Send {channelLabel} to {validCount ? count : 0} lead{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This sends real messages to customers and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {!validCount ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Count must be at least 1. Zero would send to every eligible lead, so it is blocked.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Channel</span>
              <span className="font-medium">{channelLabel}</span>
              <span className="text-muted-foreground">Recipients</span>
              <span className="font-mono-num font-medium">{count}</span>
            </div>
            {sample.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  First {sample.length}
                </p>
                <ul className="space-y-0.5 rounded-md border bg-muted/40 px-3 py-2">
                  {sample.map((c, i) => (
                    <li key={`${c}-${i}`} className="truncate">
                      {c || "Unnamed company"}
                    </li>
                  ))}
                  {count > sample.length && (
                    <li className="text-muted-foreground">+ {count - sample.length} more</li>
                  )}
                </ul>
              </div>
            )}
            {requireTypedCount && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Type <b className="font-mono-num text-foreground">{count}</b> to confirm
                </span>
                <Input
                  autoFocus
                  inputMode="numeric"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void go();
                  }}
                  aria-label="Type the count to confirm"
                />
              </label>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={!canConfirm}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Send{validCount ? ` ${count}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
