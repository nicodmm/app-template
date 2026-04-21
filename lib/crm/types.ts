export type CrmProviderId = "pipedrive" | "hubspot" | "kommo" | "dynamics";
export type CrmDealStatus = "open" | "won";

export interface ConnectionContext {
  accessToken: string;
  apiDomain: string;
}

export interface ConnectionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface ExchangeResult extends ConnectionTokens {
  externalUserId: string;
  externalCompanyId: string;
  externalCompanyDomain: string | null;
  scope: string;
}

export interface CrmPipeline {
  externalId: string;
  name: string;
  orderNr?: number;
}

export interface CrmStage {
  externalId: string;
  pipelineExternalId: string;
  name: string;
  orderNr: number;
}

export interface CrmCustomField {
  key: string;
  name: string;
  fieldType: string;
  options?: { id: string; label: string }[];
}

export interface CrmSourceValue {
  externalId: string;
  name: string;
}

export interface CrmDeal {
  externalId: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: CrmDealStatus;
  pipelineExternalId: string;
  stageExternalId: string;
  sourceExternalId: string | null;
  ownerName: string | null;
  personName: string | null;
  orgName: string | null;
  addTime: Date;
  updateTime: Date;
  wonTime: Date | null;
  rawData: Record<string, unknown>;
}
