import { db } from "@/lib/drizzle/db";
import { selectionCandidates } from "@/lib/drizzle/schema";
import { eq, desc } from "drizzle-orm";

export interface PublicCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  expectedSalary: string | null;
  status: string;
  clientRating: number;
  clientNotes: string | null;
  interviewModality: string | null;
  interviewSchedule: string | null;
  offerConditions: string | null;
  rejectionReason: string | null;
  hasCv: boolean;
  reportContent: string | null;
  reportStatus: string;
}

export async function loadCandidatesForSearch(
  searchId: string
): Promise<PublicCandidate[]> {
  const rows = await db
    .select({
      id: selectionCandidates.id,
      firstName: selectionCandidates.firstName,
      lastName: selectionCandidates.lastName,
      email: selectionCandidates.email,
      phone: selectionCandidates.phone,
      linkedinUrl: selectionCandidates.linkedinUrl,
      expectedSalary: selectionCandidates.expectedSalary,
      status: selectionCandidates.status,
      clientRating: selectionCandidates.clientRating,
      clientNotes: selectionCandidates.clientNotes,
      interviewModality: selectionCandidates.interviewModality,
      interviewSchedule: selectionCandidates.interviewSchedule,
      offerConditions: selectionCandidates.offerConditions,
      rejectionReason: selectionCandidates.rejectionReason,
      cvStoragePath: selectionCandidates.cvStoragePath,
      cvUrl: selectionCandidates.cvUrl,
      reportContent: selectionCandidates.reportContent,
      reportStatus: selectionCandidates.reportStatus,
    })
    .from(selectionCandidates)
    .where(eq(selectionCandidates.searchId, searchId))
    .orderBy(desc(selectionCandidates.createdAt));

  return rows.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    linkedinUrl: c.linkedinUrl,
    expectedSalary: c.expectedSalary,
    status: c.status,
    clientRating: c.clientRating,
    clientNotes: c.clientNotes,
    interviewModality: c.interviewModality,
    interviewSchedule: c.interviewSchedule,
    offerConditions: c.offerConditions,
    rejectionReason: c.rejectionReason,
    hasCv: c.cvStoragePath != null || c.cvUrl != null,
    reportContent: c.reportContent,
    reportStatus: c.reportStatus,
  }));
}
