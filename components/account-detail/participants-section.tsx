import { Users as UsersIcon } from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ParticipantsPanel } from "@/components/participants-panel";
import { getAccountParticipants } from "@/lib/queries/participants";

export async function ParticipantsSection({
  accountId,
}: {
  accountId: string;
}) {
  const participants = await getAccountParticipants(accountId);
  return (
    <CollapsibleSection
      title="Contactos y Participantes"
      icon={<UsersIcon size={16} aria-hidden />}
      summary={
        participants.length === 0
          ? "sin contactos"
          : `${participants.length} contacto${participants.length !== 1 ? "s" : ""}`
      }
    >
      <ParticipantsPanel participants={participants} />
    </CollapsibleSection>
  );
}
