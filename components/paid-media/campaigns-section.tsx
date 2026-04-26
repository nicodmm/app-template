import { getCampaignsWithKpis } from "@/lib/queries/paid-media";
import { PaidMediaCampaignsTable } from "@/components/paid-media-campaigns-table";

interface Props {
  adAccountId: string;
  since: string;
  until: string;
  currency: string;
  isEcommerce: boolean;
}

export async function PaidMediaCampaignsSection({
  adAccountId,
  since,
  until,
  currency,
  isEcommerce,
}: Props) {
  const campaigns = await getCampaignsWithKpis(adAccountId, since, until);
  return (
    <PaidMediaCampaignsTable
      campaigns={campaigns}
      currency={currency}
      isEcommerce={isEcommerce}
      since={since}
      until={until}
    />
  );
}
