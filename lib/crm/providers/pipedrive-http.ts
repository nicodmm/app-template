import { CrmApiError } from "../errors";

interface PipedriveFetchOptions {
  accessToken: string;
  apiDomain: string;
  searchParams?: Record<string, string | number | undefined>;
  method?: "GET" | "POST";
  body?: unknown;
}

export async function pipedriveFetch<T>(
  path: string,
  opts: PipedriveFetchOptions
): Promise<T> {
  const params = new URLSearchParams();
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
  }
  const url = `https://${opts.apiDomain}${path}${params.toString() ? `?${params.toString()}` : ""}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
    throw new CrmApiError(429, "pipedrive", `Rate limited; retry after ${retryAfter}s`);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new CrmApiError(
      0,
      "pipedrive",
      `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!res.ok) {
    const errJson = json as { error?: string; error_info?: string };
    const errMsg = errJson?.error ?? errJson?.error_info ?? `HTTP ${res.status}`;
    throw new CrmApiError(res.status, "pipedrive", errMsg, json);
  }

  return json as T;
}

export async function* pipedrivePaginate<T>(
  path: string,
  opts: PipedriveFetchOptions
): AsyncGenerator<T, void, void> {
  let start = 0;
  const limit = 500;
  while (true) {
    const response = await pipedriveFetch<{
      data: T[] | null;
      additional_data?: {
        pagination?: { more_items_in_collection: boolean; next_start?: number };
      };
    }>(path, {
      ...opts,
      searchParams: { ...opts.searchParams, start, limit },
    });

    const data = response.data ?? [];
    for (const item of data) yield item;

    const pagination = response.additional_data?.pagination;
    if (!pagination?.more_items_in_collection) break;
    if (typeof pagination.next_start !== "number") break;
    start = pagination.next_start;
  }
}
