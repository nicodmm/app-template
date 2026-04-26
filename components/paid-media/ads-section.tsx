import { getActiveAdsWithKpis } from "@/lib/queries/paid-media";
import { PaidMediaAdsTable } from "@/components/paid-media-ads-table";

interface Props {
  adAccountId: string;
  since: string;
  until: string;
  currency: string;
  isEcommerce: boolean;
}

export async function PaidMediaAdsSection({
  adAccountId,
  since,
  until,
  currency,
  isEcommerce,
}: Props) {
  const ads = await getActiveAdsWithKpis(adAccountId, since, until);
  return (
    <PaidMediaAdsTable
      ads={ads}
      currency={currency}
      isEcommerce={isEcommerce}
      adAccountId={adAccountId}
      since={since}
      until={until}
    />
  );
}
