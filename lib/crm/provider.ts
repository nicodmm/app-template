import type {
  ConnectionContext,
  CrmProviderId,
  CrmPipeline,
  CrmStage,
  CrmCustomField,
  CrmSourceValue,
  CrmDeal,
  ConnectionTokens,
  ExchangeResult,
  CrmDealStatus,
} from "./types";
import { pipedriveProvider } from "./providers/pipedrive";

export interface CrmProvider {
  id: CrmProviderId;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<ExchangeResult>;
  refreshToken(refreshToken: string): Promise<ConnectionTokens>;
  fetchPipelines(conn: ConnectionContext): Promise<CrmPipeline[]>;
  fetchStages(conn: ConnectionContext, pipelineExternalId: string): Promise<CrmStage[]>;
  fetchCustomFields(conn: ConnectionContext): Promise<CrmCustomField[]>;
  fetchSourceCatalog(
    conn: ConnectionContext,
    sourceFieldType: "channel" | "custom",
    sourceFieldKey: string
  ): Promise<CrmSourceValue[]>;
  fetchDeals(params: {
    conn: ConnectionContext;
    pipelineExternalIds: string[];
    openStageExternalIds: string[];
    statuses: CrmDealStatus[];
    sourceFieldType: "channel" | "custom";
    sourceFieldKey: string;
    updatedSince?: Date;
  }): AsyncGenerator<CrmDeal>;
  fetchLostOrDeletedIdsSince(
    conn: ConnectionContext,
    updatedSince: Date
  ): Promise<string[]>;
}

export function getProvider(id: string): CrmProvider {
  switch (id) {
    case "pipedrive":
      return pipedriveProvider;
    default:
      throw new Error(`Unknown CRM provider: ${id}`);
  }
}
