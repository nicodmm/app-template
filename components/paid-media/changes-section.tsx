import { getChangeEventsForAdAccount } from "@/lib/queries/paid-media";
import { PaidMediaChangeTimeline } from "@/components/paid-media-change-timeline";

interface Props {
  adAccountId: string;
  since: string;
  until: string;
}

export async function PaidMediaChangesSection({
  adAccountId,
  since,
  until,
}: Props) {
  const events = await getChangeEventsForAdAccount(
    adAccountId,
    since,
    until,
    100,
    0
  );
  return (
    <PaidMediaChangeTimeline events={events} totalAvailable={events.length} />
  );
}
