// Hardcoded fixtures for the public /demo experience. None of this touches
// the production database — every page under app/(public)/demo reads from
// here. If the real schema or types change, update this file accordingly so
// the demo keeps compiling.

import type { Account } from "@/lib/drizzle/schema";
import type { AccountWithOwner } from "@/lib/queries/accounts";
import type {
  DashboardSnapshot,
  DashboardBreakdown,
  HealthBucket,
  AccountsListRow,
} from "@/lib/queries/dashboard";

const today = new Date("2026-04-27T20:00:00Z");

function daysAgo(n: number): Date {
  return new Date(today.getTime() - n * 86400000);
}

function dateOnlyDaysAgo(n: number): string {
  return daysAgo(n).toISOString().slice(0, 10);
}

export const DEMO_WORKSPACE = {
  id: "demo-workspace-id",
  name: "Bloom Marketing",
  slug: "bloom",
  agencyContext:
    "Agencia de growth marketing con foco en ecommerce y SaaS B2B. Tickets entre USD 3.000 y USD 12.000 mensuales. ICP: empresas de 11-200 empleados que ya validaron product-market-fit y quieren escalar adquisición paga.",
  services: [
    "Paid Media",
    "SEO",
    "Email Marketing",
    "Content",
    "CRO",
    "Analytics",
  ] as string[],
};

export const DEMO_USER = {
  id: "demo-user-id",
  email: "maria@bloom.demo",
  fullName: "María González",
  role: "owner" as const,
  initial: "M",
};

interface DemoAccountSeed {
  id: string;
  name: string;
  industry: string;
  industryCategory: string;
  employeeCount: string;
  location: string;
  companyDescription: string;
  websiteUrl: string;
  linkedinUrl: string;
  goals: string;
  serviceScope: string;
  startDateDaysAgo: number;
  fee: number;
  healthSignal: HealthBucket;
  healthJustification: string | null;
  aiSummary: string;
  clientSummary: string;
  closed: boolean;
  lastActivityDaysAgo: number;
}

const SEEDS: DemoAccountSeed[] = [
  {
    id: "demo-acme",
    name: "Acme Ecommerce",
    industry: "Ecommerce de productos para mascotas",
    industryCategory: "Ecommerce",
    employeeCount: "51-200",
    location: "Buenos Aires, Argentina",
    companyDescription:
      "Ecommerce DTC de comida y accesorios premium para mascotas, con foco en suscripciones mensuales y delivery same-day en CABA + GBA.",
    websiteUrl: "https://acme.demo",
    linkedinUrl: "https://www.linkedin.com/company/acme-demo",
    goals:
      "Bajar el CAC un 25% en H2 y subir las suscripciones recurrentes del 18% al 30% del revenue total.",
    serviceScope: "Paid Media, SEO, CRO",
    startDateDaysAgo: 540,
    fee: 8500,
    healthSignal: "green",
    healthJustification:
      "Excelente comunicación con el equipo, KPIs de paid media subiendo mes a mes y nuevo proyecto de CRO ya aprobado.",
    aiSummary:
      "Cuenta en estado verde porque consolidamos relación de largo plazo y ya hay aprobado un upsell de CRO de USD 2.500/mes. Le interesa principalmente acelerar suscripciones recurrentes para estabilizar revenue. María Castro se la nota confiada y motivada por los resultados de Q1. Próximos pasos: arrancar el sprint de CRO en mayo y revisar la mezcla de canales con vista a Q3.\n\n**Situación actual:**\n• Paid Media performando bien (CAC -18% YoY)\n• CRO arranca el 5 de mayo\n\n**Compromisos pendientes:**\n• Definir KPIs específicos de CRO antes del kickoff\n• Pasar dashboard semanal con suscripciones nuevas vs canceladas",
    clientSummary:
      "Esta semana cerramos la planificación del sprint de CRO que arranca el 5 de mayo. Los resultados de paid media siguen mejorando (CAC -18% interanual) y vamos a sumar reportes semanales de suscripciones a partir del lunes. Coordinamos un check-in mensual para revisar la mezcla de canales con vista al segundo semestre.",
    closed: false,
    lastActivityDaysAgo: 2,
  },
  {
    id: "demo-techflow",
    name: "TechFlow SaaS",
    industry: "SaaS B2B de gestión de RRHH",
    industryCategory: "SaaS",
    employeeCount: "11-50",
    location: "Madrid, España",
    companyDescription:
      "Plataforma SaaS de people analytics para empresas medianas, enfocada en retención y engagement. Vendida vía outbound + content marketing.",
    websiteUrl: "https://techflow.demo",
    linkedinUrl: "https://www.linkedin.com/company/techflow-demo",
    goals:
      "Triplicar leads SQL en 6 meses sin subir el CPL más de 15%.",
    serviceScope: "Paid Media, Content",
    startDateDaysAgo: 280,
    fee: 6200,
    healthSignal: "green",
    healthJustification:
      "Cumpliendo objetivos. La nueva campaña de LinkedIn empezó hace 3 semanas y ya supera el CTR esperado.",
    aiSummary:
      "Cuenta en estado verde porque la campaña de LinkedIn está performando arriba del benchmark. Le interesa principalmente generar más SQLs de empresas de 50-200 empleados. Tomás Vidal se lo nota satisfecho pero con presión de su CFO por mostrar atribución más clara. Próximos pasos: implementar tracking de revenue attribution en HubSpot y propuesta de expandir a YouTube.\n\n**Situación actual:**\n• LinkedIn Ads con CTR 2.4% (benchmark 1.6%)\n• Pipeline atribuido +42% YoY\n\n**Compromisos pendientes:**\n• Implementar UTMs estandarizados\n• Demo de YouTube Ads para mid-may",
    clientSummary:
      "Las campañas de LinkedIn vienen muy bien — CTR un 50% arriba del benchmark del rubro. Esta semana avanzamos con la estandarización de tracking en HubSpot para mostrar revenue atribuido con más claridad. Para mediados de mayo te traemos la propuesta de expansión a YouTube que charlamos.",
    closed: false,
    lastActivityDaysAgo: 5,
  },
  {
    id: "demo-bonsai",
    name: "Bonsai Studio",
    industry: "Agencia de diseño de marca",
    industryCategory: "Agencia/Marketing",
    employeeCount: "11-50",
    location: "Ciudad de México, México",
    companyDescription:
      "Estudio de branding y diseño con foco en startups Series A-B. Mezcla de proyectos uno-a-uno y retainers.",
    websiteUrl: "https://bonsai.demo",
    linkedinUrl: "https://www.linkedin.com/company/bonsai-demo",
    goals:
      "Generar pipeline calificado de empresas latinoamericanas que recién levantaron Series A.",
    serviceScope: "SEO, Content",
    startDateDaysAgo: 65,
    fee: 4800,
    healthSignal: "yellow",
    healthJustification:
      "Onboarding más lento de lo esperado. Faltan accesos a Google Search Console y aún no validamos la primera entrega de contenido.",
    aiSummary:
      "Cuenta en estado amarillo porque el onboarding se trabó en accesos técnicos. Le interesa principalmente posicionar 'branding para startups' como keyword y generar 5 leads cualificados/mes. Diego López se lo nota frustrado con la velocidad de su equipo interno (no con nosotros). Próximos pasos: empujar reunión de accesos esta semana y mostrar primer borrador de calendario editorial.\n\n**Situación actual:**\n• Sin accesos GSC desde hace 3 semanas\n• Calendario editorial entregado, sin feedback\n\n**Riesgos:**\n• Si no destrabamos accesos antes del 15 de mayo entramos en mes 3 sin entregable medible",
    clientSummary:
      "Tenemos avanzado el calendario editorial y la estrategia de keywords objetivo. Para arrancar a publicar y medir resultados necesitamos cerrar los accesos a Google Search Console — sumamos un punto en la próxima reunión para destrabarlo. Apenas tengamos eso, lanzamos las primeras dos piezas en una semana.",
    closed: false,
    lastActivityDaysAgo: 9,
  },
  {
    id: "demo-lumen",
    name: "Lumen Education",
    industry: "Plataforma de cursos online de programación",
    industryCategory: "Educación",
    employeeCount: "51-200",
    location: "Bogotá, Colombia",
    companyDescription:
      "Edtech B2C que vende bootcamps de programación de 6 meses con garantía de empleo. Public objetivo: 22-35 años en LATAM.",
    websiteUrl: "https://lumen.demo",
    linkedinUrl: "https://www.linkedin.com/company/lumen-demo",
    goals:
      "Sostener un volumen mínimo de 80 inscripciones/mes con CPA por debajo de USD 110.",
    serviceScope: "Paid Media, Email Marketing, Analytics",
    startDateDaysAgo: 380,
    fee: 7800,
    healthSignal: "green",
    healthJustification:
      "Cuenta estable, KPIs predecibles. El equipo del cliente confía y delega bien.",
    aiSummary:
      "Cuenta en estado verde porque venimos sosteniendo el CPA dentro del rango sin sustos hace seis meses. Le interesa principalmente diversificar canales para no depender tanto de Meta. Sofía Rincón se la nota tranquila y abierta a probar TikTok Ads. Próximos pasos: arrancar piloto de TikTok el 12 de mayo con USD 4.000 de prueba.\n\n**Situación actual:**\n• CPA promedio últimos 90 días: USD 96\n• Inscripciones mensuales sostenidas en ~95\n\n**Compromisos pendientes:**\n• Setup de piloto TikTok Ads\n• Reporte mensual con desglose por cohorte",
    clientSummary:
      "Las inscripciones siguen por encima del piso de 80/mes y el CPA bajo el techo de USD 110. Esta semana arrancamos el setup del piloto en TikTok que charlamos en la última reunión — empieza el 12 de mayo con un presupuesto inicial de USD 4.000. Cualquier ajuste lo coordinamos antes del lanzamiento.",
    closed: false,
    lastActivityDaysAgo: 1,
  },
  {
    id: "demo-northbank",
    name: "NorthBank Fintech",
    industry: "Wallet de pagos digital para freelancers",
    industryCategory: "Fintech",
    employeeCount: "201-500",
    location: "São Paulo, Brasil",
    companyDescription:
      "Wallet con cuenta digital, tarjeta y conversión multi-divisa para freelancers latinoamericanos que cobran en USD/EUR.",
    websiteUrl: "https://northbank.demo",
    linkedinUrl: "https://www.linkedin.com/company/northbank-demo",
    goals:
      "Bajar el costo por activación (depósito mínimo USD 50) un 30% antes de cierre de Q3.",
    serviceScope: "Paid Media, CRO",
    startDateDaysAgo: 210,
    fee: 11500,
    healthSignal: "red",
    healthJustification:
      "El costo por activación viene subiendo 4 semanas seguidas. El cliente puso en duda el contrato y pidió revisión.",
    aiSummary:
      "Cuenta en estado rojo porque el cost per activation está 35% arriba del target y el equipo del cliente perdió paciencia. Le interesa principalmente recuperar eficiencia rápido — está priorizando ese KPI sobre crecimiento. Lucas Almeida se lo nota tenso y con presión interna. Próximos pasos: presentar plan de remediación de 30 días con tres palancas concretas el 30 de abril.\n\n**Situación actual:**\n• CPA actual: USD 168 (target USD 110)\n• Conversion rate landing -22% vs Q1\n\n**Riesgos:**\n• Cliente solicitó revisión de contrato — riesgo de churn alto",
    clientSummary:
      "Estamos ejecutando un plan de remediación de 30 días para volver el costo de activación al target. Para el 30 de abril te llevamos un análisis con tres palancas concretas: ajuste de creatives, reasignación de budget entre canales y un experimento de landing. Cualquier dato que nos puedas compartir antes de esa fecha nos ayuda a refinar la propuesta.",
    closed: false,
    lastActivityDaysAgo: 3,
  },
  {
    id: "demo-verde",
    name: "Verde Retail",
    industry: "Cadena de tiendas físicas de productos orgánicos",
    industryCategory: "Retail",
    employeeCount: "201-500",
    location: "Santiago, Chile",
    companyDescription:
      "Cadena de 12 sucursales en RM y Valparaíso. Foco en consumidores conscientes 30-50 años. Vienen lanzando un canal de delivery propio.",
    websiteUrl: "https://verde.demo",
    linkedinUrl: "https://www.linkedin.com/company/verde-demo",
    goals:
      "Llevar el delivery propio del 4% al 15% del revenue total en 6 meses.",
    serviceScope: "Paid Media, SEO",
    startDateDaysAgo: 130,
    fee: 5400,
    healthSignal: "yellow",
    healthJustification:
      "Pidieron pausar la estrategia de SEO mientras resuelven temas de stock. Hay incertidumbre sobre el roadmap.",
    aiSummary:
      "Cuenta en estado amarillo por una pausa parcial de servicios mientras el cliente resuelve fricción interna con su sistema de stock. Le interesa principalmente que el delivery propio escale, pero el equipo está apagando incendios. Carolina Pérez se la nota apurada y dispersa — entendible. Próximos pasos: mantener paid media activo, congelar SEO 30 días y reagendar review de roadmap para el 20 de mayo.\n\n**Situación actual:**\n• SEO pausado desde hace 2 semanas\n• Paid Media operando a media máquina\n\n**Compromisos pendientes:**\n• Reagenda review estratégica (cliente lo pidió)\n• Proyección revenue delivery próximos 90 días",
    clientSummary:
      "Mantenemos el motor de paid media corriendo a buen ritmo y pausamos temporalmente las acciones de SEO mientras destraban el tema de stock. Reagendamos la próxima review estratégica para el 20 de mayo, donde te traemos también una proyección de revenue del delivery propio para los próximos 90 días.",
    closed: false,
    lastActivityDaysAgo: 12,
  },
  {
    id: "demo-atlas",
    name: "Atlas Logistics",
    industry: "Consultoría en logística y supply chain",
    industryCategory: "Servicios profesionales",
    employeeCount: "11-50",
    location: "Lima, Perú",
    companyDescription:
      "Consultora boutique que asesora a operadores logísticos medianos en optimización de rutas y costos.",
    websiteUrl: "https://atlas.demo",
    linkedinUrl: "https://www.linkedin.com/company/atlas-demo",
    goals:
      "Generar 10 leads B2B/mes calificados para reuniones comerciales.",
    serviceScope: "Content, SEO",
    startDateDaysAgo: 95,
    fee: 3200,
    healthSignal: "inactive",
    healthJustification: null,
    aiSummary:
      "Cuenta en estado inactivo porque el cliente no respondió las últimas dos comunicaciones programadas y no agendó la review de mes 3. Le interesaba principalmente posicionarse como referente en LATAM, pero la prioridad parece haber cambiado. Sin interlocutor directo identificado en este momento. Próximos pasos: forzar contacto con el sponsor original antes de fin de mes y, si no hay respuesta, escalar formalmente.\n\n**Situación actual:**\n• Sin contacto desde hace 4 semanas\n• Contenidos publicados sin feedback\n\n**Riesgos:**\n• Posible churn silencioso. Hay que cerrar status sí o sí esta semana.",
    clientSummary:
      "Tu cuenta sigue activa. Te traemos una actualización completa pronto.",
    closed: false,
    lastActivityDaysAgo: 28,
  },
  {
    id: "demo-pixel",
    name: "PixelPress Media",
    industry: "Productora de podcasts y contenido en video",
    industryCategory: "Media y entretenimiento",
    employeeCount: "1-10",
    location: "Montevideo, Uruguay",
    companyDescription:
      "Productora boutique que crea podcasts originales y series para marcas. Está empezando a vender su catálogo a sponsors.",
    websiteUrl: "https://pixelpress.demo",
    linkedinUrl: "https://www.linkedin.com/company/pixelpress-demo",
    goals:
      "Cerrar al menos 4 acuerdos de sponsoring premium en H1.",
    serviceScope: "Email Marketing, Content",
    startDateDaysAgo: 35,
    fee: 2900,
    healthSignal: "green",
    healthJustification:
      "Onboarding muy fluido, primera secuencia de email outbound corriendo desde la semana pasada.",
    aiSummary:
      "Cuenta en estado verde porque la cuenta arrancó sin fricción y ya hay 23 respuestas positivas en la primera secuencia outbound. Le interesa principalmente conectar con brand managers de empresas medianas que invierten en contenido de marca. Pablo Iturri se lo nota energizado por las primeras señales. Próximos pasos: mantener cadencia de outbound y armar un mini-deck para acelerar cierres en mayo.\n\n**Situación actual:**\n• 1ra secuencia outbound: 23 leads tibios\n• Pipeline qualifying: 6 cuentas\n\n**Compromisos pendientes:**\n• Versión final del deck de sponsoring\n• Workshop de descubrimiento con sales lead",
    clientSummary:
      "Las primeras dos semanas de outbound vinieron muy bien — ya hay 23 respuestas positivas y 6 cuentas avanzando hacia reunión. Esta semana terminamos el deck de sponsoring y coordinamos un workshop con tu equipo de ventas para alinear el mensaje. Apenas tengamos las primeras reuniones cerradas, te las pasamos en el reporte semanal.",
    closed: false,
    lastActivityDaysAgo: 4,
  },
];

function buildAccount(seed: DemoAccountSeed): AccountWithOwner {
  const startDate = dateOnlyDaysAgo(seed.startDateDaysAgo);
  const account: Account = {
    id: seed.id,
    workspaceId: DEMO_WORKSPACE.id,
    name: seed.name,
    ownerId: DEMO_USER.id,
    goals: seed.goals,
    serviceScope: seed.serviceScope,
    startDate,
    fee: seed.fee.toFixed(2),
    enabledModules: {
      paid_media: true,
      crm: true,
      context_upload: true,
      tasks: true,
      participants: true,
      signals: true,
      health: true,
    },
    websiteUrl: seed.websiteUrl,
    linkedinUrl: seed.linkedinUrl,
    driveFolderId: null,
    driveFolderName: null,
    driveFolderSyncedAt: null,
    driveFolderMatchAccountName: false,
    industry: seed.industry,
    industryCategory: seed.industryCategory,
    employeeCount: seed.employeeCount,
    location: seed.location,
    companyDescription: seed.companyDescription,
    enrichedAt: daysAgo(Math.min(seed.startDateDaysAgo, 14)),
    enrichmentStatus: "ok",
    enrichmentError: null,
    healthSignal: seed.healthSignal,
    healthJustification: seed.healthJustification,
    aiSummary: seed.aiSummary,
    aiSummaryUpdatedAt: daysAgo(Math.max(seed.lastActivityDaysAgo, 1)),
    clientSummary: seed.clientSummary,
    clientSummaryUpdatedAt: daysAgo(Math.max(seed.lastActivityDaysAgo, 1)),
    lastActivityAt: daysAgo(seed.lastActivityDaysAgo),
    closedAt: seed.closed ? daysAgo(0) : null,
    hasAdConnections:
      seed.serviceScope.includes("Paid Media") ? true : false,
    createdAt: daysAgo(seed.startDateDaysAgo),
    updatedAt: daysAgo(seed.lastActivityDaysAgo),
  };
  return {
    ...account,
    ownerName: DEMO_USER.fullName,
    ownerEmail: DEMO_USER.email,
  };
}

export const DEMO_ACCOUNTS: AccountWithOwner[] = SEEDS.map(buildAccount);

export function getDemoAccountById(id: string): AccountWithOwner | null {
  return DEMO_ACCOUNTS.find((a) => a.id === id) ?? null;
}

// ----- Dashboard snapshot ---------------------------------------------------

export const DEMO_DASHBOARD_SNAPSHOT: DashboardSnapshot = (() => {
  const active = DEMO_ACCOUNTS.filter((a) => !a.closedAt);
  const totalAccounts = active.length;
  const healthDistribution: Record<HealthBucket, number> = {
    green: 0,
    yellow: 0,
    red: 0,
    inactive: 0,
  };
  for (const a of active) {
    const k = (a.healthSignal ?? "inactive") as HealthBucket;
    healthDistribution[k] += 1;
  }
  const fees = active
    .map((a) => (a.fee !== null ? Number(a.fee) : null))
    .filter((n): n is number => n !== null);
  const feeTotal = fees.reduce((sum, n) => sum + n, 0);
  const ticketAverage =
    fees.length > 0 ? feeTotal / fees.length : null;
  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);
  const durations = active
    .map((a) => {
      if (!a.startDate) return null;
      const start = new Date(a.startDate).getTime();
      const months = (today.getTime() - start) / MS_PER_MONTH;
      return Number.isFinite(months) && months >= 0 ? months : null;
    })
    .filter((n): n is number => n !== null);
  const durationMonthsAverage =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
  const ltv =
    ticketAverage !== null && durationMonthsAverage !== null
      ? ticketAverage * durationMonthsAverage
      : null;

  // Industry distribution
  const industryCounts = new Map<string, number>();
  for (const a of active) {
    const k =
      (a.industryCategory ?? "").trim() || "Sin clasificar";
    industryCounts.set(k, (industryCounts.get(k) ?? 0) + 1);
  }
  const industries = [...industryCounts.entries()]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count);

  // Size distribution
  const sizeCounts = new Map<string, number>();
  for (const a of active) {
    const k = (a.employeeCount ?? "").trim() || "Sin clasificar";
    sizeCounts.set(k, (sizeCounts.get(k) ?? 0) + 1);
  }
  const sizes = [...sizeCounts.entries()]
    .map(([employeeCount, count]) => ({ employeeCount, count }))
    .sort((a, b) => b.count - a.count);

  // Top activity (use mocked counts)
  const ACTIVITY_BY_ID: Record<string, { t: number; d: number }> = {
    "demo-acme": { t: 8, d: 6 },
    "demo-techflow": { t: 5, d: 4 },
    "demo-bonsai": { t: 2, d: 1 },
    "demo-lumen": { t: 7, d: 5 },
    "demo-northbank": { t: 9, d: 3 },
    "demo-verde": { t: 3, d: 2 },
    "demo-atlas": { t: 1, d: 1 },
    "demo-pixel": { t: 4, d: 2 },
  };
  const topActivity = active
    .map((a) => {
      const entry = ACTIVITY_BY_ID[a.id] ?? { t: 0, d: 0 };
      const transcriptsCount = entry.t;
      const documentsCount = entry.d;
      const activityCount = transcriptsCount + documentsCount;
      let activityPerMonth: number | null = null;
      if (a.startDate) {
        const start = new Date(a.startDate).getTime();
        const months = (today.getTime() - start) / MS_PER_MONTH;
        if (Number.isFinite(months) && months >= 1) {
          activityPerMonth = activityCount / months;
        }
      }
      return {
        accountId: a.id,
        accountName: a.name,
        fee: a.fee !== null ? Number(a.fee) : null,
        transcriptsCount,
        documentsCount,
        activityCount,
        activityPerMonth,
      };
    })
    .filter((r) => r.activityCount > 0)
    .sort((a, b) => {
      if (a.activityPerMonth === null && b.activityPerMonth === null) return 0;
      if (a.activityPerMonth === null) return 1;
      if (b.activityPerMonth === null) return -1;
      return b.activityPerMonth - a.activityPerMonth;
    })
    .slice(0, 10);

  return {
    totalAccounts,
    healthDistribution,
    feeTotal,
    ticketAverage,
    durationMonthsAverage,
    ltv,
    accountsWithoutFee: 0,
    opportunitiesCount: 4,
    topActivity,
    industries,
    sizes,
  };
})();

// ----- Pre-computed breakdown rows for the metric drawer --------------------

function buildBreakdown(): DashboardBreakdown {
  const active = DEMO_ACCOUNTS.filter((a) => !a.closedAt);

  const byIndustryMap = new Map<string, { fee: number; n: number; months: number[] }>();
  const bySizeMap = new Map<string, { fee: number; n: number; months: number[] }>();
  const byServiceMap = new Map<string, { fee: number; n: number; months: number[] }>();
  const byOwnerMap = new Map<string, { fee: number; n: number; months: number[] }>();

  for (const a of active) {
    const fee = a.fee !== null ? Number(a.fee) : 0;
    const months =
      a.startDate
        ? (today.getTime() - new Date(a.startDate).getTime()) /
          (1000 * 60 * 60 * 24 * 30.44)
        : 0;

    const indKey = a.industryCategory ?? "Sin clasificar";
    const indEntry = byIndustryMap.get(indKey) ?? { fee: 0, n: 0, months: [] };
    indEntry.fee += fee;
    indEntry.n += 1;
    if (months > 0) indEntry.months.push(months);
    byIndustryMap.set(indKey, indEntry);

    const szKey = a.employeeCount ?? "Sin clasificar";
    const szEntry = bySizeMap.get(szKey) ?? { fee: 0, n: 0, months: [] };
    szEntry.fee += fee;
    szEntry.n += 1;
    if (months > 0) szEntry.months.push(months);
    bySizeMap.set(szKey, szEntry);

    const services = (a.serviceScope ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of services) {
      const entry = byServiceMap.get(s) ?? { fee: 0, n: 0, months: [] };
      entry.fee += fee;
      entry.n += 1;
      if (months > 0) entry.months.push(months);
      byServiceMap.set(s, entry);
    }

    const ownerKey = a.ownerName ?? "Sin responsable";
    const ownerEntry = byOwnerMap.get(ownerKey) ?? { fee: 0, n: 0, months: [] };
    ownerEntry.fee += fee;
    ownerEntry.n += 1;
    if (months > 0) ownerEntry.months.push(months);
    byOwnerMap.set(ownerKey, ownerEntry);
  }

  function toRows(
    map: Map<string, { fee: number; n: number; months: number[] }>
  ) {
    return [...map.entries()]
      .map(([label, e]) => ({
        label,
        value: e.fee,
        accountsCount: e.n,
      }))
      .sort((a, b) => b.value - a.value);
  }

  return {
    byService: toRows(byServiceMap),
    byIndustry: toRows(byIndustryMap),
    bySize: toRows(bySizeMap),
    byOwner: toRows(byOwnerMap),
  };
}

export const DEMO_DASHBOARD_BREAKDOWN: DashboardBreakdown = buildBreakdown();

// ----- Per-account details for the detail page -----------------------------

export interface DemoSignal {
  id: string;
  type: string;
  description: string;
  status: "active" | "resolved";
  createdAt: Date;
}
export interface DemoTask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  priority: number;
  createdAt: Date;
  assigneeName: string | null;
}
export interface DemoTranscript {
  id: string;
  fileName: string;
  meetingDate: string | null;
  meetingSummary: string;
  status: "completed";
  createdAt: Date;
}
export interface DemoContextDoc {
  id: string;
  title: string;
  docType: string;
  notes: string | null;
  createdAt: Date;
}
export interface DemoParticipant {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  appearanceCount: number;
}
export interface DemoHealthHistory {
  id: string;
  healthSignal: HealthBucket;
  justification: string | null;
  createdAt: Date;
}
export interface DemoCampaign {
  id: string;
  name: string;
  publicName: string | null;
  status: "ACTIVE" | "PAUSED";
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
}
export interface DemoCrmDeal {
  id: string;
  title: string;
  pipeline: string;
  stage: string;
  value: number;
  currency: string;
  status: "open" | "won" | "lost";
}

export interface DemoAccountDetail {
  signals: DemoSignal[];
  tasks: DemoTask[];
  transcripts: DemoTranscript[];
  files: DemoContextDoc[];
  participants: DemoParticipant[];
  healthHistory: DemoHealthHistory[];
  paidMedia: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    campaigns: DemoCampaign[];
  } | null;
  crm: DemoCrmDeal | null;
}

const DEFAULT_DETAIL: DemoAccountDetail = {
  signals: [],
  tasks: [],
  transcripts: [],
  files: [],
  participants: [],
  healthHistory: [],
  paidMedia: null,
  crm: null,
};

const DETAIL_BY_ID: Record<string, DemoAccountDetail> = {
  "demo-acme": {
    signals: [
      {
        id: "sig-acme-1",
        type: "upsell_opportunity",
        description:
          "Mencionaron que están evaluando agregar Email Marketing a su stack — buena oportunidad para upselling el módulo.",
        status: "active",
        createdAt: daysAgo(7),
      },
      {
        id: "sig-acme-2",
        type: "growth_opportunity",
        description:
          "Aprobaron un sprint de CRO de USD 2.500/mes que arranca en mayo. Confirmar capacidad del equipo.",
        status: "active",
        createdAt: daysAgo(2),
      },
    ],
    tasks: [
      {
        id: "task-acme-1",
        description:
          "Pasar dashboard semanal con suscripciones nuevas vs canceladas",
        status: "pending",
        priority: 2,
        createdAt: daysAgo(3),
        assigneeName: "María González",
      },
      {
        id: "task-acme-2",
        description:
          "Definir KPIs específicos del sprint de CRO antes del kickoff",
        status: "in_progress",
        priority: 1,
        createdAt: daysAgo(5),
        assigneeName: "María González",
      },
      {
        id: "task-acme-3",
        description:
          "Preparar mini-deck con resultados YoY para presentar al CFO de Acme",
        status: "pending",
        priority: 3,
        createdAt: daysAgo(8),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-acme-1",
        fileName: "Acme · Review Q1 2026",
        meetingDate: dateOnlyDaysAgo(2),
        meetingSummary:
          "Reunión de cierre de Q1. Confirmaron CRO arrancando 5 de mayo. Pidieron reporte semanal de suscripciones.\n\n**Situación actual:**\n• KPIs Q1 superados en 14% sobre objetivo\n• Equipo del cliente alineado y motivado\n\n**Compromisos pendientes:**\n• Definir KPIs CRO\n• Reporte semanal con desglose nuevo/cancel",
        status: "completed",
        createdAt: daysAgo(2),
      },
      {
        id: "trans-acme-2",
        fileName: "Acme · Sync mensual marzo",
        meetingDate: dateOnlyDaysAgo(28),
        meetingSummary:
          "Revisión de paid media de marzo. CAC bajó otro 6% vs febrero. Presentamos propuesta de CRO que el cliente se llevó para evaluar internamente.",
        status: "completed",
        createdAt: daysAgo(28),
      },
      {
        id: "trans-acme-3",
        fileName: "Acme · Discovery CRO",
        meetingDate: dateOnlyDaysAgo(45),
        meetingSummary:
          "Llamada de discovery con equipo de producto. Identificamos 3 fricciones en checkout y 2 en flow de suscripción. Acordamos avanzar con propuesta.",
        status: "completed",
        createdAt: daysAgo(45),
      },
    ],
    files: [
      {
        id: "doc-acme-1",
        title: "Roadmap producto Acme Q2 2026",
        docType: "presentation",
        notes:
          "Roadmap interno compartido por el cliente con releases planeados de abril a junio.",
        createdAt: daysAgo(15),
      },
      {
        id: "doc-acme-2",
        title: "Reporte de retención mensual",
        docType: "report",
        notes:
          "Spreadsheet con cohortes de suscripción de los últimos 12 meses.",
        createdAt: daysAgo(35),
      },
    ],
    participants: [
      {
        id: "p-acme-1",
        name: "María Castro",
        role: "Head of Marketing",
        email: "maria@acme.demo",
        appearanceCount: 12,
      },
      {
        id: "p-acme-2",
        name: "Diego Romero",
        role: "Performance Manager",
        email: "diego@acme.demo",
        appearanceCount: 8,
      },
      {
        id: "p-acme-3",
        name: "Ana Pereyra",
        role: "Producto",
        email: "ana@acme.demo",
        appearanceCount: 3,
      },
    ],
    healthHistory: [
      { id: "hh-1", healthSignal: "green", justification: null, createdAt: daysAgo(3) },
      { id: "hh-2", healthSignal: "green", justification: null, createdAt: daysAgo(17) },
      { id: "hh-3", healthSignal: "green", justification: null, createdAt: daysAgo(31) },
      { id: "hh-4", healthSignal: "yellow", justification: null, createdAt: daysAgo(45) },
      { id: "hh-5", healthSignal: "yellow", justification: null, createdAt: daysAgo(60) },
      { id: "hh-6", healthSignal: "green", justification: null, createdAt: daysAgo(74) },
      { id: "hh-7", healthSignal: "green", justification: null, createdAt: daysAgo(88) },
      { id: "hh-8", healthSignal: "green", justification: null, createdAt: daysAgo(102) },
      { id: "hh-9", healthSignal: "green", justification: null, createdAt: daysAgo(116) },
      { id: "hh-10", healthSignal: "yellow", justification: null, createdAt: daysAgo(130) },
      { id: "hh-11", healthSignal: "green", justification: null, createdAt: daysAgo(144) },
      { id: "hh-12", healthSignal: "green", justification: null, createdAt: daysAgo(158) },
    ],
    paidMedia: {
      spend: 1240000, // cents → USD 12,400
      impressions: 1820000,
      clicks: 41200,
      conversions: 1840,
      campaigns: [
        {
          id: "camp-acme-1",
          name: "[BR_PROSP_TOFU] Awareness V3 - LAL 1%",
          publicName: "Awareness Argentina · Audiencia tibia",
          status: "ACTIVE",
          spend: 480000,
          impressions: 720000,
          clicks: 16200,
          conversions: 720,
          ctr: 2.25,
          cpc: 0.296,
          cpa: 6.66,
        },
        {
          id: "camp-acme-2",
          name: "[BR_RTGT_BOFU] Carrito abandonado V2",
          publicName: "Recupero de carrito",
          status: "ACTIVE",
          spend: 380000,
          impressions: 540000,
          clicks: 13200,
          conversions: 660,
          ctr: 2.44,
          cpc: 0.287,
          cpa: 5.75,
        },
        {
          id: "camp-acme-3",
          name: "[BR_PROSP_MOFU] Suscripción mensual",
          publicName: "Suscripción mensual · Conversión",
          status: "ACTIVE",
          spend: 280000,
          impressions: 420000,
          clicks: 9000,
          conversions: 380,
          ctr: 2.14,
          cpc: 0.311,
          cpa: 7.36,
        },
        {
          id: "camp-acme-4",
          name: "[BR_PROSP_TOFU] Test creativos V1",
          publicName: null,
          status: "PAUSED",
          spend: 100000,
          impressions: 140000,
          clicks: 2800,
          conversions: 80,
          ctr: 2.0,
          cpc: 0.357,
          cpa: 12.5,
        },
      ],
    },
    crm: {
      id: "crm-acme-1",
      title: "Acme — renovación + CRO upsell",
      pipeline: "Cuentas activas",
      stage: "Negociación",
      value: 12500,
      currency: "USD",
      status: "open",
    },
  },
  "demo-techflow": {
    signals: [
      {
        id: "sig-tf-1",
        type: "upsell_opportunity",
        description:
          "El CFO está pidiendo más visibilidad de revenue atribuido — buena ventana para vender un addon de Analytics.",
        status: "active",
        createdAt: daysAgo(10),
      },
    ],
    tasks: [
      {
        id: "task-tf-1",
        description: "Implementar UTMs estandarizados en todas las campañas",
        status: "in_progress",
        priority: 1,
        createdAt: daysAgo(6),
        assigneeName: "María González",
      },
      {
        id: "task-tf-2",
        description: "Demo de YouTube Ads para mid-may",
        status: "pending",
        priority: 2,
        createdAt: daysAgo(12),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-tf-1",
        fileName: "TechFlow · Status semanal",
        meetingDate: dateOnlyDaysAgo(5),
        meetingSummary:
          "Repasamos métricas de LinkedIn Ads (CTR 2.4%) y tracking en HubSpot. El CFO de TechFlow pidió más claridad en revenue atribuido. Avanzamos con propuesta de YouTube.",
        status: "completed",
        createdAt: daysAgo(5),
      },
      {
        id: "trans-tf-2",
        fileName: "TechFlow · Kickoff campaña LinkedIn",
        meetingDate: dateOnlyDaysAgo(24),
        meetingSummary:
          "Lanzamos la nueva campaña de LinkedIn Ads. Definimos audiencias por industria + size, copys A/B y creative rotation cada 14 días.",
        status: "completed",
        createdAt: daysAgo(24),
      },
    ],
    files: [
      {
        id: "doc-tf-1",
        title: "Pipeline H1 2026",
        docType: "spreadsheet",
        notes: "Spreadsheet del CRO con pipeline atribuido por canal.",
        createdAt: daysAgo(20),
      },
      {
        id: "doc-tf-2",
        title: "Brand guidelines TechFlow",
        docType: "presentation",
        notes: null,
        createdAt: daysAgo(80),
      },
    ],
    participants: [
      {
        id: "p-tf-1",
        name: "Tomás Vidal",
        role: "Head of Growth",
        email: "tomas@techflow.demo",
        appearanceCount: 6,
      },
      {
        id: "p-tf-2",
        name: "Lucía Méndez",
        role: "Marketing Manager",
        email: "lucia@techflow.demo",
        appearanceCount: 4,
      },
    ],
    healthHistory: [
      { id: "hh-tf-1", healthSignal: "green", justification: null, createdAt: daysAgo(5) },
      { id: "hh-tf-2", healthSignal: "green", justification: null, createdAt: daysAgo(19) },
      { id: "hh-tf-3", healthSignal: "yellow", justification: null, createdAt: daysAgo(33) },
      { id: "hh-tf-4", healthSignal: "yellow", justification: null, createdAt: daysAgo(47) },
      { id: "hh-tf-5", healthSignal: "green", justification: null, createdAt: daysAgo(61) },
      { id: "hh-tf-6", healthSignal: "green", justification: null, createdAt: daysAgo(75) },
      { id: "hh-tf-7", healthSignal: "green", justification: null, createdAt: daysAgo(89) },
      { id: "hh-tf-8", healthSignal: "green", justification: null, createdAt: daysAgo(103) },
    ],
    paidMedia: {
      spend: 620000,
      impressions: 480000,
      clicks: 11500,
      conversions: 240,
      campaigns: [
        {
          id: "camp-tf-1",
          name: "[ES_LKD_TOFU] HRTech ICP V2",
          publicName: "LinkedIn · ICP RRHH",
          status: "ACTIVE",
          spend: 420000,
          impressions: 320000,
          clicks: 7800,
          conversions: 165,
          ctr: 2.44,
          cpc: 0.538,
          cpa: 25.45,
        },
        {
          id: "camp-tf-2",
          name: "[ES_LKD_BOFU] Demo request retarget",
          publicName: "LinkedIn · Demo retarget",
          status: "ACTIVE",
          spend: 200000,
          impressions: 160000,
          clicks: 3700,
          conversions: 75,
          ctr: 2.31,
          cpc: 0.541,
          cpa: 26.67,
        },
      ],
    },
    crm: {
      id: "crm-tf-1",
      title: "TechFlow — addon Analytics",
      pipeline: "Upsells",
      stage: "Propuesta",
      value: 1800,
      currency: "USD",
      status: "open",
    },
  },
  "demo-bonsai": {
    signals: [],
    tasks: [
      {
        id: "task-bonsai-1",
        description:
          "Empujar reunión de accesos GSC esta semana",
        status: "pending",
        priority: 1,
        createdAt: daysAgo(3),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-bonsai-1",
        fileName: "Bonsai · Onboarding semana 8",
        meetingDate: dateOnlyDaysAgo(9),
        meetingSummary:
          "Diego mostró frustración con los tiempos internos para conseguir accesos a GSC. Mostramos calendario editorial draft. Sin feedback aún.",
        status: "completed",
        createdAt: daysAgo(9),
      },
    ],
    files: [],
    participants: [
      {
        id: "p-bonsai-1",
        name: "Diego López",
        role: "Founder",
        email: "diego@bonsai.demo",
        appearanceCount: 3,
      },
    ],
    healthHistory: [
      { id: "hh-b-1", healthSignal: "yellow", justification: null, createdAt: daysAgo(9) },
      { id: "hh-b-2", healthSignal: "yellow", justification: null, createdAt: daysAgo(23) },
      { id: "hh-b-3", healthSignal: "green", justification: null, createdAt: daysAgo(37) },
      { id: "hh-b-4", healthSignal: "green", justification: null, createdAt: daysAgo(51) },
    ],
    paidMedia: null,
    crm: null,
  },
  "demo-lumen": {
    signals: [
      {
        id: "sig-lu-1",
        type: "growth_opportunity",
        description:
          "El cliente está abierto a probar TikTok Ads — buena ventana para diversificar canales.",
        status: "active",
        createdAt: daysAgo(8),
      },
    ],
    tasks: [
      {
        id: "task-lu-1",
        description: "Setup de piloto TikTok Ads (12 de mayo)",
        status: "in_progress",
        priority: 2,
        createdAt: daysAgo(3),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-lu-1",
        fileName: "Lumen · Sync mensual abril",
        meetingDate: dateOnlyDaysAgo(1),
        meetingSummary:
          "Inscripciones por encima del piso, CPA bajo el techo. Avanzamos con piloto TikTok arrancando 12 de mayo.",
        status: "completed",
        createdAt: daysAgo(1),
      },
      {
        id: "trans-lu-2",
        fileName: "Lumen · Discovery TikTok",
        meetingDate: dateOnlyDaysAgo(22),
        meetingSummary:
          "Discovery sobre canales adicionales. Sofía abierta a TikTok pero no a YouTube por presupuesto. Pidió piloto chico.",
        status: "completed",
        createdAt: daysAgo(22),
      },
    ],
    files: [
      {
        id: "doc-lu-1",
        title: "Cohorte abril — desglose por bootcamp",
        docType: "spreadsheet",
        notes: null,
        createdAt: daysAgo(6),
      },
    ],
    participants: [
      {
        id: "p-lu-1",
        name: "Sofía Rincón",
        role: "Head of Growth",
        email: "sofia@lumen.demo",
        appearanceCount: 9,
      },
    ],
    healthHistory: [
      { id: "hh-lu-1", healthSignal: "green", justification: null, createdAt: daysAgo(1) },
      { id: "hh-lu-2", healthSignal: "green", justification: null, createdAt: daysAgo(15) },
      { id: "hh-lu-3", healthSignal: "green", justification: null, createdAt: daysAgo(29) },
      { id: "hh-lu-4", healthSignal: "green", justification: null, createdAt: daysAgo(43) },
      { id: "hh-lu-5", healthSignal: "green", justification: null, createdAt: daysAgo(57) },
      { id: "hh-lu-6", healthSignal: "yellow", justification: null, createdAt: daysAgo(71) },
      { id: "hh-lu-7", healthSignal: "green", justification: null, createdAt: daysAgo(85) },
      { id: "hh-lu-8", healthSignal: "green", justification: null, createdAt: daysAgo(99) },
    ],
    paidMedia: {
      spend: 940000,
      impressions: 1200000,
      clicks: 28000,
      conversions: 980,
      campaigns: [
        {
          id: "camp-lu-1",
          name: "[CO_PROSP_TOFU] Bootcamp dev V4",
          publicName: "Bootcamp programación · Awareness",
          status: "ACTIVE",
          spend: 580000,
          impressions: 740000,
          clicks: 17800,
          conversions: 620,
          ctr: 2.41,
          cpc: 0.326,
          cpa: 9.35,
        },
        {
          id: "camp-lu-2",
          name: "[CO_RTGT_BOFU] Apply now",
          publicName: "Conversión · Apply now",
          status: "ACTIVE",
          spend: 360000,
          impressions: 460000,
          clicks: 10200,
          conversions: 360,
          ctr: 2.22,
          cpc: 0.353,
          cpa: 10.0,
        },
      ],
    },
    crm: {
      id: "crm-lu-1",
      title: "Lumen — piloto TikTok",
      pipeline: "Upsells",
      stage: "Aprobado",
      value: 4000,
      currency: "USD",
      status: "open",
    },
  },
  "demo-northbank": {
    signals: [
      {
        id: "sig-nb-1",
        type: "upsell_opportunity",
        description:
          "Si recuperamos eficiencia, podríamos vender CRO + analytics avanzado. Hoy NO mencionar — primero estabilizar.",
        status: "active",
        createdAt: daysAgo(14),
      },
    ],
    tasks: [
      {
        id: "task-nb-1",
        description:
          "Presentar plan de remediación 30 días (3 palancas) el 30 de abril",
        status: "in_progress",
        priority: 1,
        createdAt: daysAgo(2),
        assigneeName: "María González",
      },
      {
        id: "task-nb-2",
        description:
          "Auditoría de creatives actuales — identificar fatiga",
        status: "in_progress",
        priority: 1,
        createdAt: daysAgo(4),
        assigneeName: "María González",
      },
      {
        id: "task-nb-3",
        description:
          "Hipótesis de re-asignación de budget Meta vs Google",
        status: "pending",
        priority: 2,
        createdAt: daysAgo(3),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-nb-1",
        fileName: "NorthBank · Crisis call",
        meetingDate: dateOnlyDaysAgo(3),
        meetingSummary:
          "Lucas pidió revisión de contrato. Acordamos plan de remediación de 30 días con tres palancas concretas. Presentación el 30 de abril.",
        status: "completed",
        createdAt: daysAgo(3),
      },
      {
        id: "trans-nb-2",
        fileName: "NorthBank · Status semanal mar",
        meetingDate: dateOnlyDaysAgo(17),
        meetingSummary:
          "Tercera semana consecutiva de aumento del CPA. Lucas marca preocupación. Acordamos auditar creatives.",
        status: "completed",
        createdAt: daysAgo(17),
      },
    ],
    files: [],
    participants: [
      {
        id: "p-nb-1",
        name: "Lucas Almeida",
        role: "VP Marketing",
        email: "lucas@northbank.demo",
        appearanceCount: 7,
      },
      {
        id: "p-nb-2",
        name: "Renata Costa",
        role: "Performance Lead",
        email: "renata@northbank.demo",
        appearanceCount: 4,
      },
    ],
    healthHistory: [
      { id: "hh-nb-1", healthSignal: "red", justification: null, createdAt: daysAgo(3) },
      { id: "hh-nb-2", healthSignal: "red", justification: null, createdAt: daysAgo(17) },
      { id: "hh-nb-3", healthSignal: "yellow", justification: null, createdAt: daysAgo(31) },
      { id: "hh-nb-4", healthSignal: "yellow", justification: null, createdAt: daysAgo(45) },
      { id: "hh-nb-5", healthSignal: "green", justification: null, createdAt: daysAgo(59) },
      { id: "hh-nb-6", healthSignal: "green", justification: null, createdAt: daysAgo(73) },
    ],
    paidMedia: {
      spend: 2480000,
      impressions: 3200000,
      clicks: 58000,
      conversions: 1480,
      campaigns: [
        {
          id: "camp-nb-1",
          name: "[BR_PROSP_FB_TOFU] Freelancer wallet",
          publicName: null,
          status: "ACTIVE",
          spend: 1480000,
          impressions: 1900000,
          clicks: 36000,
          conversions: 920,
          ctr: 1.89,
          cpc: 0.411,
          cpa: 16.09,
        },
        {
          id: "camp-nb-2",
          name: "[BR_PROSP_GG_TOFU] Search wallet brasil",
          publicName: null,
          status: "ACTIVE",
          spend: 1000000,
          impressions: 1300000,
          clicks: 22000,
          conversions: 560,
          ctr: 1.69,
          cpc: 0.455,
          cpa: 17.86,
        },
      ],
    },
    crm: {
      id: "crm-nb-1",
      title: "NorthBank — renovación en riesgo",
      pipeline: "Cuentas activas",
      stage: "Renovación",
      value: 11500,
      currency: "USD",
      status: "open",
    },
  },
  "demo-verde": {
    signals: [],
    tasks: [
      {
        id: "task-v-1",
        description:
          "Reagenda review estratégica (cliente pidió)",
        status: "pending",
        priority: 2,
        createdAt: daysAgo(11),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-v-1",
        fileName: "Verde · Sync abril",
        meetingDate: dateOnlyDaysAgo(12),
        meetingSummary:
          "Carolina pidió pausar SEO 30 días por temas de stock. Mantienen paid media activo. Reagendaron próxima review.",
        status: "completed",
        createdAt: daysAgo(12),
      },
    ],
    files: [],
    participants: [
      {
        id: "p-v-1",
        name: "Carolina Pérez",
        role: "Head of Marketing",
        email: "carolina@verde.demo",
        appearanceCount: 5,
      },
    ],
    healthHistory: [
      { id: "hh-v-1", healthSignal: "yellow", justification: null, createdAt: daysAgo(12) },
      { id: "hh-v-2", healthSignal: "green", justification: null, createdAt: daysAgo(26) },
      { id: "hh-v-3", healthSignal: "green", justification: null, createdAt: daysAgo(40) },
    ],
    paidMedia: {
      spend: 320000,
      impressions: 480000,
      clicks: 9200,
      conversions: 280,
      campaigns: [
        {
          id: "camp-v-1",
          name: "[CL_DLV_TOFU] Delivery propio V1",
          publicName: "Delivery propio · Awareness",
          status: "ACTIVE",
          spend: 320000,
          impressions: 480000,
          clicks: 9200,
          conversions: 280,
          ctr: 1.92,
          cpc: 0.348,
          cpa: 11.43,
        },
      ],
    },
    crm: null,
  },
  "demo-atlas": {
    signals: [],
    tasks: [
      {
        id: "task-a-1",
        description:
          "Forzar contacto con sponsor original esta semana",
        status: "pending",
        priority: 1,
        createdAt: daysAgo(2),
        assigneeName: "María González",
      },
    ],
    transcripts: [],
    files: [
      {
        id: "doc-a-1",
        title: "Lista de keywords objetivo",
        docType: "note",
        notes: null,
        createdAt: daysAgo(60),
      },
    ],
    participants: [],
    healthHistory: [
      { id: "hh-a-1", healthSignal: "inactive", justification: null, createdAt: daysAgo(28) },
      { id: "hh-a-2", healthSignal: "yellow", justification: null, createdAt: daysAgo(42) },
    ],
    paidMedia: null,
    crm: null,
  },
  "demo-pixel": {
    signals: [
      {
        id: "sig-px-1",
        type: "growth_opportunity",
        description:
          "Excelentes señales tempranas — 23 leads tibios en primera semana. Aprovechar para hacer un caso de estudio interno.",
        status: "active",
        createdAt: daysAgo(4),
      },
    ],
    tasks: [
      {
        id: "task-px-1",
        description: "Versión final del deck de sponsoring",
        status: "in_progress",
        priority: 2,
        createdAt: daysAgo(3),
        assigneeName: "María González",
      },
      {
        id: "task-px-2",
        description: "Workshop de descubrimiento con sales lead",
        status: "pending",
        priority: 2,
        createdAt: daysAgo(5),
        assigneeName: "María González",
      },
    ],
    transcripts: [
      {
        id: "trans-px-1",
        fileName: "PixelPress · Status semana 5",
        meetingDate: dateOnlyDaysAgo(4),
        meetingSummary:
          "Pablo súper energizado por las primeras respuestas (23 leads tibios). Avanzamos con la versión final del deck.",
        status: "completed",
        createdAt: daysAgo(4),
      },
    ],
    files: [],
    participants: [
      {
        id: "p-px-1",
        name: "Pablo Iturri",
        role: "Founder",
        email: "pablo@pixelpress.demo",
        appearanceCount: 2,
      },
    ],
    healthHistory: [
      { id: "hh-px-1", healthSignal: "green", justification: null, createdAt: daysAgo(4) },
      { id: "hh-px-2", healthSignal: "green", justification: null, createdAt: daysAgo(18) },
    ],
    paidMedia: null,
    crm: null,
  },
};

export function getDemoAccountDetail(id: string): DemoAccountDetail {
  return DETAIL_BY_ID[id] ?? DEFAULT_DETAIL;
}

// ----- Pre-computed accounts list rows for drawer drill-down ----------------

export function getDemoAccountsListByFilter(
  filterType: "health" | "industry" | "size" | "opportunities",
  filterValue: string
): AccountsListRow[] {
  let filtered = DEMO_ACCOUNTS.filter((a) => !a.closedAt);
  if (filterType === "health") {
    filtered = filtered.filter(
      (a) =>
        (a.healthSignal ?? "inactive") === filterValue ||
        (filterValue === "inactive" && a.healthSignal === null)
    );
  } else if (filterType === "industry") {
    filtered = filtered.filter(
      (a) => (a.industryCategory ?? "Sin clasificar") === filterValue
    );
  } else if (filterType === "size") {
    filtered = filtered.filter(
      (a) => (a.employeeCount ?? "Sin clasificar") === filterValue
    );
  } else if (filterType === "opportunities") {
    const accountsWithOpps = new Set(
      Object.entries(DETAIL_BY_ID)
        .filter(([, d]) =>
          d.signals.some(
            (s) =>
              s.status === "active" &&
              (s.type === "upsell_opportunity" ||
                s.type === "growth_opportunity")
          )
        )
        .map(([id]) => id)
    );
    filtered = filtered.filter((a) => accountsWithOpps.has(a.id));
  }
  return filtered.map((a) => ({
    id: a.id,
    name: a.name,
    serviceScope: a.serviceScope,
    ownerName: a.ownerName,
    healthSignal: (a.healthSignal ?? "inactive") as HealthBucket,
  }));
}
