// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabaseServer";
import AdminClient from "./page.client";

export default async function AdminPage() {
  const supabase = await getSupabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) redirect("/signin?redirect=/admin");

  // Only app_admins can access
  const { data: adminRow } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", u.user.id)
    .maybeSingle();

  if (!adminRow) redirect("/403");

  return <AdminClient />;
}
