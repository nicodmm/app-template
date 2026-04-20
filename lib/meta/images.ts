import { metaGraphFetch } from "./client";

type AdImageApi = {
  hash: string;
  url?: string;
  url_128?: string;
};

export type ResolvedImage = {
  url: string | null;
  thumbnailUrl: string | null;
};

export async function resolveImageUrlsByHash(
  metaAdAccountId: string,
  accessToken: string,
  hashes: string[]
): Promise<Map<string, ResolvedImage>> {
  const result = new Map<string, ResolvedImage>();
  if (hashes.length === 0) return result;

  const unique = Array.from(new Set(hashes));
  const chunkSize = 50;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const response = await metaGraphFetch<{ data: AdImageApi[] }>(
      `/${metaAdAccountId}/adimages`,
      {
        accessToken,
        searchParams: {
          hashes: JSON.stringify(chunk),
          fields: "hash,url,url_128",
        },
      }
    );

    for (const img of response.data) {
      if (!img.hash) continue;
      result.set(img.hash, {
        url: img.url ?? null,
        thumbnailUrl: img.url_128 ?? null,
      });
    }
  }

  return result;
}
