export interface ReportInputs {
  candidateName: string;
  position: string;
  positionDescription: string | null;
  cvText: string | null;
  recruiterNotes: string | null;
  linkedinUrl: string | null;
  expectedSalary: string | null;
  currentSalary: string | null;
}

export const SELECTION_REPORT_SYSTEM = `Actúa como un especialista/consultor en recursos humanos, experto en la elaboración de informes de perfiles profesionales para selección. Tu objetivo es analizar la información provista para crear un reporte detallado y profesional de un candidato.

Reglas:
- Tono profesional, serio, objetivo y constructivo. No emitas juicios personales.
- Básate ÚNICAMENTE en la información proporcionada. Si un dato no existe, omití esa parte (no inventes).
- Devolvé el informe en Markdown, con estas secciones (en este orden), omitiendo las que no apliquen por falta de datos:
  1. **Resumen ejecutivo**
  2. **Datos generales** (edad, formación, residencia, composición familiar, idiomas — solo si existen)
  3. **Resumen académico**
  4. **Resumen de la experiencia laboral**
  5. **Motivación al cambio laboral**
  6. **Compensación actual y pretendida + Beneficios**
  7. **Análisis de competencias de acuerdo al puesto** (separá competencias soft y hard, comparando contra los requisitos del puesto)
  8. **Recomendaciones estratégicas**
- Mantené confidencialidad y ética profesional. No incluyas ningún preámbulo conversacional: devolvé directamente el informe en Markdown.`;

export function buildReportUserMessage(i: ReportInputs): string {
  const parts: string[] = [];
  parts.push(`Candidato: ${i.candidateName}`);
  parts.push(`Puesto al que aplica: ${i.position}`);
  if (i.positionDescription)
    parts.push(`Descripción / requisitos del puesto:\n${i.positionDescription}`);
  if (i.expectedSalary) parts.push(`Remuneración pretendida: ${i.expectedSalary}`);
  if (i.currentSalary) parts.push(`Remuneración actual: ${i.currentSalary}`);
  if (i.linkedinUrl) parts.push(`LinkedIn: ${i.linkedinUrl}`);
  if (i.recruiterNotes)
    parts.push(`Notas del reclutador (entrevistas, tests, observaciones):\n${i.recruiterNotes}`);
  if (i.cvText) parts.push(`Texto del CV:\n${i.cvText}`);
  parts.push("\nElaborá el informe profesional del candidato siguiendo la estructura indicada.");
  return parts.join("\n\n");
}
