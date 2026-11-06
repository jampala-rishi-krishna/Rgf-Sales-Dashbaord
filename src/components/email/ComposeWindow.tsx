import { useRef, useState } from "react";
import { Maximize2, Minimize2, Minus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichEditor, type RichEditorHandle } from "./RichEditor";
import { SendButton } from "./SendButton";

/** Floating Gmail "New message" window, bottom-right. */
export function ComposeWindow({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [state, setState] = useState<"normal" | "min" | "max">("normal");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const editor = useRef<RichEditorHandle>(null);

  const invalidReason = /\S+@\S+\.\S+/.test(to) ? undefined : "Add at least one recipient";

  const header = (
    <div
      className="flex items-center h-10 pl-4 pr-2 bg-[#F2F6FC] dark:bg-[#2D2F31] rounded-t-xl cursor-pointer select-none"
      onClick={() => setState((s) => (s === "min" ? "normal" : "min"))}
    >
      <span className="flex-1 text-sm font-medium text-[var(--ch-text)] truncate">
        {subject || "New Message"}
      </span>
      {[
        {
          icon: Minus,
          label: state === "min" ? "Restore" : "Minimize",
          run: () => setState((s) => (s === "min" ? "normal" : "min")),
        },
        {
          icon: state === "max" ? Minimize2 : Maximize2,
          label: state === "max" ? "Exit full screen" : "Full screen",
          run: () => setState((s) => (s === "max" ? "normal" : "max")),
        },
        { icon: X, label: "Close compose", run: onClose },
      ].map(({ icon: Icon, label, run }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          onClick={(e) => {
            e.stopPropagation();
            run();
          }}
          className="h-7 w-7 grid place-items-center rounded hover:bg-black/10 text-[var(--ch-text-2)]"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );

  return (
    <>
      {state === "max" && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setState("normal")} />
      )}
      <div
        role="dialog"
        aria-label="New message"
        className={cn(
          "fixed z-50 flex flex-col bg-[var(--ch-panel)] rounded-t-xl shadow-[0_8px_40px_rgba(0,0,0,.25)] overflow-hidden",
          state === "max"
            ? "inset-4 md:inset-x-[10%] md:inset-y-10 rounded-xl"
            : "bottom-0 right-0 md:right-6 w-full md:w-[540px]",
          state === "min" && "md:w-[280px]",
        )}
      >
        {header}
        <div className={cn("flex flex-col flex-1 min-h-0", state === "min" && "hidden")}>
          <div className="flex items-center border-b border-gray-200 dark:border-white/10 mx-4">
            <label className="text-sm text-[var(--ch-text-2)] w-8" htmlFor="compose-to">
              To
            </label>
            <input
              id="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 h-9 bg-transparent text-sm outline-none text-[var(--ch-text)]"
              autoFocus
            />
            {!showCc && (
              <button
                type="button"
                className="text-sm text-[var(--ch-text-2)] hover:underline"
                onClick={() => setShowCc(true)}
              >
                Cc
              </button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center border-b border-gray-200 dark:border-white/10 mx-4">
              <label className="text-sm text-[var(--ch-text-2)] w-8" htmlFor="compose-cc">
                Cc
              </label>
              <input
                id="compose-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="flex-1 h-9 bg-transparent text-sm outline-none text-[var(--ch-text)]"
              />
            </div>
          )}
          <input
            aria-label="Subject"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mx-4 h-9 border-b border-gray-200 dark:border-white/10 bg-transparent text-sm outline-none text-[var(--ch-text)] placeholder:text-[var(--ch-text-2)]"
          />
          <div
            className={cn(
              "px-4 flex-1 min-h-0 overflow-y-auto",
              state === "max" ? "" : "max-h-[50vh]",
            )}
          >
            <RichEditor ref={editor} minHeight={state === "max" ? 360 : 220} />
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <SendButton
              invalidReason={invalidReason}
              build={() => ({
                to: to.trim(),
                cc: cc.trim() || undefined,
                subject: subject.trim(),
                html: editor.current?.getHtml() || "<p></p>",
              })}
              onSent={() => {
                onSent();
                onClose();
              }}
            />
            <div className="flex-1" />
            <button
              type="button"
              aria-label="Discard draft"
              title="Discard draft"
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
