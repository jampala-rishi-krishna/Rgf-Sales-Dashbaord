export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`leading-none select-none ${className}`} style={{ color: "#86000B" }}>
      <div className="text-2xl font-black tracking-tight">RARE</div>
      <div className="text-[9px] font-bold tracking-[0.2em]">GLOBAL FOOD</div>
    </div>
  );
}
