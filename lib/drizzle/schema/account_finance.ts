import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { workspaces } from "./workspaces";

export const accountFinance = pgTable(
  "account_finance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    razonSocial: text("razon_social"),
    cuit: text("cuit"),
    billingEmail: text("billing_email"),
    ivaCondition: text("iva_condition"),
    leadOrigin: text("lead_origin"),
    clientEmail: text("client_email"),
    clientResponsible: text("client_responsible"),
    legalRepName: text("legal_rep_name"),
    legalRepDni: text("legal_rep_dni"),
    legalRepEmail: text("legal_rep_email"),
    legalAddress: text("legal_address"),
    city: text("city"),
    country: text("country"),
    ndaStoragePath: text("nda_storage_path"),
    ndaUrl: text("nda_url"),
    ndaFileName: text("nda_file_name"),
    ndaExtractedText: text("nda_extracted_text"),
    ndaExtractionStatus: text("nda_extraction_status").notNull().default("none"),
    ndaExtractionError: text("nda_extraction_error"),
    ndaExtractedAt: timestamp("nda_extracted_at"),
    proposalStoragePath: text("proposal_storage_path"),
    proposalUrl: text("proposal_url"),
    proposalFileName: text("proposal_file_name"),
    invoiceCountry: text("invoice_country"),
    termsRawText: text("terms_raw_text"),
    termsStatus: text("terms_status").notNull().default("none"),
    termsError: text("terms_error"),
    termsStructuredAt: timestamp("terms_structured_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_finance_account_unique").on(table.accountId),
    index("account_finance_workspace_idx").on(table.workspaceId),
  ]
);

export type AccountFinance = typeof accountFinance.$inferSelect;
export type NewAccountFinance = typeof accountFinance.$inferInsert;
