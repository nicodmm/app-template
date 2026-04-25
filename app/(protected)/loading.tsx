import { Loader2 } from "lucide-react";

/**
 * Default suspense boundary for every protected route. Next.js renders this
 * file as soon as the user navigates into a /app/* page; it's removed once
 * the server component finishes resolving.
 *
 * Pairs with <NavProgress /> mounted in the root layout — the progress bar
 * gives an instant signal that the click registered, this component fills
 * the content area while data loads so the page doesn't feel frozen.
 */
export default function ProtectedLoading() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
        Cargando…
      </div>
    </div>
  );
}
