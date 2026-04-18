const GRAPH_API_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type MetaGraphError = {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  constructor(
    public code: number,
    public subcode: number | undefined,
    message: string,
    public raw?: unknown
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  isAuthError(): boolean {
    if (this.code !== 190) return false;
    return true;
  }

  isRateLimit(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 613 || this.code === 80004;
  }
}

type FetchOptions = {
  accessToken: string;
  searchParams?: Record<string, string | number | undefined>;
};

export async function metaGraphFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  const params = new URLSearchParams();
  if (opts.accessToken) params.set("access_token", opts.accessToken);
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
  }
  const url = `${GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}?${params.toString()}`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new MetaApiError(
      0,
      undefined,
      `Non-JSON response from Meta (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!res.ok) {
    const err = (json as { error?: MetaGraphError }).error;
    if (err) {
      throw new MetaApiError(err.code ?? 0, err.error_subcode, err.message, err);
    }
    throw new MetaApiError(res.status, undefined, `HTTP ${res.status} from Meta`, json);
  }

  return json as T;
}

export type PagedResponse<T> = {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
};

export async function* paginate<T>(
  path: string,
  opts: FetchOptions
): AsyncGenerator<T, void, void> {
  let nextUrl: string | undefined;
  let first = true;
  while (first || nextUrl) {
    const result: PagedResponse<T> = first
      ? await metaGraphFetch<PagedResponse<T>>(path, opts)
      : await (async () => {
          const res = await fetch(nextUrl!);
          const json = (await res.json()) as PagedResponse<T>;
          if (!res.ok) {
            const err = (json as unknown as { error?: MetaGraphError }).error;
            throw new MetaApiError(
              err?.code ?? 0,
              err?.error_subcode,
              err?.message ?? "paginate error",
              json
            );
          }
          return json;
        })();
    first = false;
    for (const item of result.data) yield item;
    nextUrl = result.paging?.next;
  }
}
