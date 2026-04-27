import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  decodeShareCookie,
  encodeShareCookie,
  shareCookieName,
  SHARE_COOKIE_TTL_MS,
} from "@/lib/share/cookie";
import {
  isRateLimited,
  recordPasswordAttempt,
  verifySharePassword,
} from "@/lib/share/password";
import { getPublicAccountSnapshot } from "@/lib/queries/public-account";
import { PasswordGate } from "./password-gate";
import { PublicAccountView } from "@/components/public-account-view/header";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ wrong?: string; locked?: string }>;
}

export default async function PublicSharePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;

  const result = await getPublicAccountSnapshot(token);
  if (result.status === "not_found" || result.status === "inactive") {
    notFound();
  }

  if (!result.passwordHash) {
    return <PublicAccountView snapshot={result.snapshot!} />;
  }

  const jar = await cookies();
  const cookieValue = jar.get(shareCookieName(token))?.value;
  if (cookieValue) {
    const decoded = decodeShareCookie(cookieValue);
    if (
      decoded &&
      decoded.token === token &&
      decoded.passwordVersion === result.passwordVersion
    ) {
      return <PublicAccountView snapshot={result.snapshot!} />;
    }
  }

  let error: string | undefined;
  if (sp.wrong) error = "Contraseña incorrecta.";
  if (sp.locked)
    error = "Demasiados intentos. Probá de nuevo en unos minutos.";

  async function verify(formData: FormData): Promise<void> {
    "use server";
    const submitted = (formData.get("password") as string) || "";
    const tk = (formData.get("token") as string) || "";
    if (!tk) return;
    const limited = isRateLimited(tk);
    if (limited.limited) {
      redirect(`/c/${tk}?locked=1`);
    }
    const fresh = await getPublicAccountSnapshot(tk);
    if (fresh.status === "not_found" || fresh.status === "inactive") {
      redirect(`/c/${tk}`);
    }
    if (!fresh.passwordHash) {
      redirect(`/c/${tk}`);
    }
    const ok = await verifySharePassword(submitted, fresh.passwordHash!);
    recordPasswordAttempt(tk, ok);
    if (!ok) redirect(`/c/${tk}?wrong=1`);
    const cookieJar = await cookies();
    cookieJar.set({
      name: shareCookieName(tk),
      value: encodeShareCookie({
        token: tk,
        passwordVersion: fresh.passwordVersion!,
        exp: Date.now() + SHARE_COOKIE_TTL_MS,
      }),
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SHARE_COOKIE_TTL_MS / 1000,
      path: `/c/${tk}`,
    });
    redirect(`/c/${tk}`);
  }

  return <PasswordGate token={token} error={error} action={verify} />;
}
