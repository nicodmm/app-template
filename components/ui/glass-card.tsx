import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type GlassVariant = "default" | "strong";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant;
  /** Render as <section> for top-level page panels with a heading inside. */
  as?: "div" | "section" | "article" | "aside";
}

/**
 * Frosted-glass surface. Use for cards, panels, sidebar, header, modal bodies.
 * Background, blur, border, and shadow all come from CSS vars defined per
 * theme in globals.css — do NOT override them with Tailwind colour utilities.
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard({ variant = "default", as = "div", className, ...rest }, ref) {
    const Tag = as as "div";
    const blur =
      variant === "strong" ? "backdrop-blur-[18px]" : "backdrop-blur-[14px]";
    return (
      <Tag
        ref={ref}
        className={cn(
          "rounded-xl border",
          blur,
          "[background:var(--glass-bg)]",
          variant === "strong" && "[background:var(--glass-bg-strong)]",
          "[border-color:var(--glass-border)]",
          "[box-shadow:var(--glass-shadow)]",
          className
        )}
        {...rest}
      />
    );
  }
);
