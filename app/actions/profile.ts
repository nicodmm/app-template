"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { users } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateUserName(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const raw = (formData.get("fullName") as string | null) ?? "";
  const trimmed = raw.trim();
  if (trimmed.length > 120) {
    return {
      success: false,
      error: "El nombre no puede tener más de 120 caracteres.",
    };
  }
  await db
    .update(users)
    .set({
      fullName: trimmed === "" ? null : trimmed,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  revalidatePath("/app/profile");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/settings/workspace");
  return { success: true };
}

export async function updateUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  if (newPassword.length < 8) {
    return {
      success: false,
      error: "La nueva contraseña debe tener al menos 8 caracteres.",
    };
  }
  if (newPassword === currentPassword) {
    return {
      success: false,
      error: "La nueva contraseña debe ser distinta de la actual.",
    };
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.email) {
    return { success: false, error: "No se pudo identificar al usuario." };
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (signInErr) {
    return { success: false, error: "La contraseña actual no es correcta." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}
