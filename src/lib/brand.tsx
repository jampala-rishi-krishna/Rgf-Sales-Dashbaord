export function Logo({ className = "" }: { className?: string }) {
  return (
    <div
      aria-label="Rare Global Food"
      className={`leading-none select-none text-[var(--rgf-red)] dark:text-[#E8505E] ${className}`}
    >
      <div className="text-2xl font-black tracking-tight">RARE</div>
      <div className="text-[9px] font-bold tracking-[0.2em]">GLOBAL FOOD</div>
    </div>
  );
}

/** Compact square mark for the collapsed sidebar / mobile header. */
export function LogoMark({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <div
      aria-label="Rare Global Food"
      className={`flex shrink-0 items-center justify-center rounded-[10px] font-black text-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: "linear-gradient(135deg, #86000B, #A3101C)",
      }}
    >
      R
    </div>
  );
}
