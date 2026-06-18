import Link from "next/link";
import Image from "next/image";
import { SelectionSection } from "@/components/public-account-view/selection-section";
import type { PublicSearchSnapshot } from "@/lib/queries/public-search";
import type { PublicAccountSnapshot } from "@/lib/queries/public-account";

type Selection = NonNullable<PublicAccountSnapshot["data"]["selection"]>;

interface Props {
  snapshot: PublicSearchSnapshot;
}

export function PublicSearchView({ snapshot }: Props): React.ReactElement {
  const { workspace, search, candidates, share } = snapshot;
  const selection: Selection = {
    searches: [
      {
        id: search.id,
        position: search.position,
        candidates,
      },
    ],
  };
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        {workspace.logoUrl && (
          <Image
            src={workspace.logoUrl}
            alt={workspace.name || "Logo"}
            width={200}
            height={48}
            className="h-10 w-auto max-h-12 object-contain mb-2"
            unoptimized
            priority
          />
        )}
        <p className="text-xs text-muted-foreground">{workspace.name}</p>
        <h1 className="text-3xl font-semibold">{search.position}</h1>
        {search.positionDescription && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {search.positionDescription}
          </p>
        )}
      </header>

      <SelectionSection token={share.token} selection={selection} />

      <footer className="pt-8 mt-8 [border-top:1px_solid_var(--glass-border)] text-center">
        <p className="text-xs text-muted-foreground">
          Hecho con{" "}
          <Link href="https://nao.fyi" className="underline">
            nao.fyi
          </Link>
        </p>
      </footer>
    </div>
  );
}
