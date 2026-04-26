import { getLatestMeetingSummary } from "@/lib/queries/transcripts";
import { LastMeetingCard } from "@/components/last-meeting-card";

export async function LastMeetingSection({ accountId }: { accountId: string }) {
  const summary = await getLatestMeetingSummary(accountId);
  if (!summary) return null;
  return <LastMeetingCard summary={summary} />;
}
