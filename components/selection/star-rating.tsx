"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, readOnly }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? value;

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            aria-label={`${star} estrella${star !== 1 ? "s" : ""}`}
            aria-checked={star === value}
            role="radio"
            onClick={() => onChange?.(star === value ? 0 : star)}
            onMouseEnter={() => !readOnly && setHover(star)}
            onMouseLeave={() => !readOnly && setHover(null)}
            className={cn(
              "p-0.5 transition-transform",
              !readOnly && "hover:scale-110 cursor-pointer",
              readOnly && "cursor-default"
            )}
          >
            <Star
              size={20}
              className={cn(
                "transition-colors",
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
