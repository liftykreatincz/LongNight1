"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SaveSettingsResult =
  | { success: true }
  | { success: false; error: string };

export async function saveAnthropicKey(
  formData: FormData
): Promise<SaveSettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Nejste přihlášeni." };
  }

  const rawKey = formData.get("anthropic_api_key");
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  const valueToStore = key.length > 0 ? key : null;

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        anthropic_api_key: valueToStore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}
