import { cn } from "@/lib/utils";

type Variant = "scanning" | "celebrating" | "empty" | "thinking" | "wave";

const variantEmoji: Record<Variant, string> = {
  scanning: "🔍",
  celebrating: "🎉",
  empty: "🐻",
  thinking: "💭",
  wave: "👋",
};

interface Props {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  caption?: string;
  className?: string;
}

/**
 * Placeholder bear mascot. Final illustrated asset can replace this component
 * without touching call sites. data-mascot-placeholder marks it for QA.
 */
const BearMascot = ({ variant = "empty", size = "md", caption, className }: Props) => {
  const sizeCls = size === "sm" ? "h-14 w-14 text-2xl" : size === "lg" ? "h-32 w-32 text-5xl" : "h-20 w-20 text-3xl";
  return (
    <div data-mascot-placeholder className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className={cn("relative grid place-items-center rounded-full bg-kinnso-cream2 shadow-kinnso", sizeCls)}>
        <span aria-hidden>🐻</span>
        <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-white text-sm shadow-kinnso">
          {variantEmoji[variant]}
        </span>
      </div>
      {caption && <p className="text-xs text-kinnso-muted">{caption}</p>}
    </div>
  );
};

export default BearMascot;
