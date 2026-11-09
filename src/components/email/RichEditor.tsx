import { forwardRef, useImperativeHandle, useRef } from "react";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";

export type RichEditorHandle = { getHtml: () => string; focus: () => void; clear: () => void };

/** Minimal contentEditable rich text box with a Gmail-style formatting row. */
export const RichEditor = forwardRef<
  RichEditorHandle,
  { placeholder?: string; minHeight?: number; initialHtml?: string; autoFocus?: boolean }
>(function RichEditor({ placeholder = "", minHeight = 120, initialHtml = "", autoFocus }, ref) {
  const el = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    getHtml: () => el.current?.innerHTML ?? "",
    focus: () => el.current?.focus(),
    clear: () => {
      if (el.current) el.current.innerHTML = "";
    },
  }));

  const exec = (cmd: string, value?: string) => {
    el.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const tools = [
    { icon: Bold, label: "Bold", run: () => exec("bold") },
    { icon: Italic, label: "Italic", run: () => exec("italic") },
    {
      icon: Link2,
      label: "Insert link",
      run: () => {
        const url = window.prompt("Link URL", "https://");
        if (url && /^(https?:|mailto:)/i.test(url)) exec("createLink", url);
      },
    },
    { icon: List, label: "Bulleted list", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
  ];

  return (
    <div className="flex flex-col">
      <div
        ref={(node) => {
          el.current = node;
          if (node && !node.dataset.init) {
            node.dataset.init = "1";
            node.innerHTML = initialHtml;
            if (autoFocus) requestAnimationFrame(() => node.focus());
          }
        }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Message body"}
        data-placeholder={placeholder}
        className="email-editor outline-none text-[14px] leading-relaxed text-[var(--ch-text)] px-1 py-2 overflow-y-auto [&_a]:text-[var(--ch-link)] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-[var(--ch-text-2)] empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--ch-text-2)]"
        style={{ minHeight }}
      />
      <div className="flex items-center gap-0.5 pt-1" role="toolbar" aria-label="Formatting">
        {tools.map(({ icon: Icon, label, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
            className="h-8 w-8 grid place-items-center rounded-full text-[var(--ch-text-2)] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[var(--ch-link)]"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
});
