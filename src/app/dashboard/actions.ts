"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function addShop(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = formData.get("name") as string;
  const metaToken = formData.get("meta_token") as string;
  const metaAccountId = formData.get("meta_account_id") as string;

  if (!name || !metaToken || !metaAccountId) {
    return { error: "All fields are required" };
  }

  const { error } = await supabase.from("shops").insert({
    user_id: user.id,
    name,
    meta_token: metaToken,
    meta_account_id: metaAccountId,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteShop(shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("shops")
    .delete()
    .eq("id", shopId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
