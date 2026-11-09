import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function LiveDot({ fresh, className }: { fresh: boolean; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex size-2.5 shrink-0", className)}
      role="status"
      aria-label={fresh ? "Live" : "Not updated recently"}
    >
      {fresh && (
        <span className="rgf-pulse-ring absolute inset-0 rounded-full bg-emerald-500" aria-hidden />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          fresh ? "bg-emerald-500" : "bg-zinc-400",
        )}
      />
    </span>
  );
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-PH");

export function AnimatedNumber({
  value,
  format = defaultFormat,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const ctrl = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => ctrl.stop();
  }, [value, reduce, mv]);
  return <motion.span className={cn("font-mono-num", className)}>{text}</motion.span>;
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      role="status"
      aria-label="Typing"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rgf-typing-dot size-1.5 rounded-full bg-current opacity-60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
