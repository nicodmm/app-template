import { env } from "@/lib/env";
import { CrmApiError } from "../errors";
import type { CrmProvider } from "../provider";
import type {
  ConnectionContext,
  ConnectionTokens,
  CrmCustomField,
  CrmDeal,
  CrmDealStatus,
  CrmPipeline,
  CrmSourceValue,
  CrmStage,
  ExchangeResult,
} from "../types";
import { pipedriveFetch, pipedrivePaginate } from "./pipedrive-http";

const OAUTH_HOST = "https://oauth.pipedrive.com";

type PipedriveTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  api_domain: string;
  scope: string;
  token_type: string;
};

type PipedriveUserMe = {
  data: { id: number; company_id: number; company_domain: string };
};

type PipedrivePipeline = {
  id: number;
  name: string;
  order_nr: number;
  active: boolean;
  deleted_flag?: boolean;
};

type PipedriveStage = {
  id: number;
  name: string;
  order_nr: number;
  pipeline_id: number;
  active_flag: boolean;
  deleted_flag?: boolean;
};

type PipedriveField = {
  key: string;
  name: string;
  field_type: string;
  options?: { id: number; label: string }[];
};

type PipedriveDeal = {
  id: number;
  title: string;
  value: number;
  currency: string;
  status: "open" | "won" | "lost" | "deleted";
  pipeline_id: number;
  stage_id: number;
  channel?: number | null;
  channel_id?: number | null;
  owner_name?: string;
  person_name?: string;
  org_name?: string;
  add_time: string;
  update_time: string;
  won_time?: string | null;
  is_deleted?: boolean;
  [k: string]: unknown;
};

function parsePipedriveTimestamp(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z");
}

export const pipedriveProvider: CrmProvider = {
  id: "pipedrive",

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.PIPEDRIVE_CLIENT_ID,
      redirect_uri: env.PIPEDRIVE_REDIRECT_URI,
      state,
    });
    return `${OAUTH_HOST}/oauth/authorize?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const basic = Buffer.from(
      `${env.PIPEDRIVE_CLIENT_ID}:${env.PIPEDRIVE_CLIENT_SECRET}`
    ).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.PIPEDRIVE_REDIRECT_URI,
    });

    const res = await fetch(`${OAUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const tokenResponse = (await res.json()) as PipedriveTokenResponse & {
      error?: string;
      error_description?: string;
    };
    if (!res.ok) {
      throw new CrmApiError(
        res.status,
        "pipedrive",
        tokenResponse.error_description ?? tokenResponse.error ?? "exchange failed",
        tokenResponse
      );
    }

    const me = await pipedriveFetch<PipedriveUserMe>("/v1/users/me", {
      accessToken: tokenResponse.access_token,
      apiDomain: tokenResponse.api_domain,
    });

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      externalUserId: String(me.data.id),
      externalCompanyId: String(me.data.company_id),
      externalCompanyDomain: me.data.company_domain,
      scope: tokenResponse.scope,
    };
  },

  async refreshToken(refreshToken: string): Promise<ConnectionTokens> {
    const basic = Buffer.from(
      `${env.PIPEDRIVE_CLIENT_ID}:${env.PIPEDRIVE_CLIENT_SECRET}`
    ).toString("base64");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetch(`${OAUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const tokenResponse = (await res.json()) as PipedriveTokenResponse & {
      error?: string;
    };
    if (!res.ok) {
      throw new CrmApiError(
        res.status,
        "pipedrive",
        tokenResponse.error ?? "refresh failed",
        tokenResponse
      );
    }
    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
    };
  },

  async fetchPipelines(conn: ConnectionContext): Promise<CrmPipeline[]> {
    const res = await pipedriveFetch<{ data: PipedrivePipeline[] | null }>(
      "/v1/pipelines",
      { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
    );
    return (res.data ?? [])
      .filter((p) => p.active && !p.deleted_flag)
      .map((p) => ({ externalId: String(p.id), name: p.name, orderNr: p.order_nr }));
  },

  async fetchStages(conn: ConnectionContext, pipelineExternalId: string): Promise<CrmStage[]> {
    const res = await pipedriveFetch<{ data: PipedriveStage[] | null }>(
      "/v1/stages",
      {
        accessToken: conn.accessToken,
        apiDomain: conn.apiDomain,
        searchParams: { pipeline_id: pipelineExternalId },
      }
    );
    return (res.data ?? [])
      .filter((s) => s.active_flag && !s.deleted_flag)
      .map((s) => ({
        externalId: String(s.id),
        pipelineExternalId: String(s.pipeline_id),
        name: s.name,
        orderNr: s.order_nr,
      }));
  },

  async fetchCustomFields(conn: ConnectionContext): Promise<CrmCustomField[]> {
    const res = await pipedriveFetch<{ data: PipedriveField[] | null }>(
      "/v1/dealFields",
      { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
    );
    return (res.data ?? [])
      .filter((f) => f.field_type === "enum" || f.field_type === "set")
      .map((f) => ({
        key: f.key,
        name: f.name,
        fieldType: f.field_type,
        options: f.options?.map((o) => ({ id: String(o.id), label: o.label })),
      }));
  },

  async fetchSourceCatalog(
    conn: ConnectionContext,
    sourceFieldType: "channel" | "custom",
    sourceFieldKey: string
  ): Promise<CrmSourceValue[]> {
    const res = await pipedriveFetch<{ data: PipedriveField[] | null }>(
      "/v1/dealFields",
      { accessToken: conn.accessToken, apiDomain: conn.apiDomain }
    );
    const fields = res.data ?? [];
    const targetKey = sourceFieldType === "channel" ? "channel" : sourceFieldKey;
    const field = fields.find((f) => f.key === targetKey);
    return (field?.options ?? []).map((o) => ({
      externalId: String(o.id),
      name: o.label,
    }));
  },

  async *fetchDeals(params): AsyncGenerator<CrmDeal> {
    for (const pipelineId of params.pipelineExternalIds) {
      for (const status of params.statuses) {
        const searchParams: Record<string, string | number> = {
          status,
          pipeline_id: pipelineId,
        };
        for await (const d of pipedrivePaginate<PipedriveDeal>("/v1/deals", {
          accessToken: params.conn.accessToken,
          apiDomain: params.conn.apiDomain,
          searchParams,
        })) {
          if (d.is_deleted) continue;
          if (d.status !== "open" && d.status !== "won") continue;
          const updateTime = parsePipedriveTimestamp(d.update_time);
          if (params.updatedSince && updateTime < params.updatedSince) continue;
          if (
            d.status === "open" &&
            !params.openStageExternalIds.includes(String(d.stage_id))
          ) {
            continue;
          }
          let sourceExternalId: string | null = null;
          if (params.sourceFieldType === "channel") {
            if (d.channel !== undefined && d.channel !== null) {
              sourceExternalId = String(d.channel);
            }
          } else {
            const rawVal = (d as Record<string, unknown>)[params.sourceFieldKey];
            if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
              sourceExternalId = String(rawVal);
            }
          }
          yield {
            externalId: String(d.id),
            title: d.title,
            value: typeof d.value === "number" ? d.value : null,
            currency: d.currency ?? null,
            status: d.status as CrmDealStatus,
            pipelineExternalId: String(d.pipeline_id),
            stageExternalId: String(d.stage_id),
            sourceExternalId,
            ownerName: d.owner_name ?? null,
            personName: d.person_name ?? null,
            orgName: d.org_name ?? null,
            addTime: parsePipedriveTimestamp(d.add_time),
            updateTime,
            wonTime: d.won_time ? parsePipedriveTimestamp(d.won_time) : null,
            rawData: d as Record<string, unknown>,
          };
        }
      }
    }
  },

  async fetchLostOrDeletedIdsSince(
    conn: ConnectionContext,
    updatedSince: Date
  ): Promise<string[]> {
    const ids: string[] = [];
    for await (const d of pipedrivePaginate<PipedriveDeal>("/v1/deals", {
      accessToken: conn.accessToken,
      apiDomain: conn.apiDomain,
      searchParams: { status: "lost" },
    })) {
      const updateTime = parsePipedriveTimestamp(d.update_time);
      if (updateTime >= updatedSince) ids.push(String(d.id));
    }
    return ids;
  },
};
