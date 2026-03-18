// src/app/instructor/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabaseServer";
import InstructorClient from "./page.client";

export default async function InstructorPage() {
  const supabase = await getSupabaseServer();

  // Auth (verifies with Auth server)
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) redirect("/signin?redirect=/instructor");

  // Role/Admin gate: allow instructor or app_admin
  const { data: prof } = await supabase
    .from("profiles")
    .select("role, committee_role")
    .eq("id", user.id)
    .maybeSingle();

  let isAdmin = false;
  if (!isAdmin) {
    const { data: adminRow } = await supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = !!adminRow;
  }

  const isChair =
    prof?.role === "committee" && prof?.committee_role === "chief_editor";

  if (!isAdmin && prof?.role !== "instructor" && !isChair) {
    redirect("/403");
  }

  return <InstructorClient />;
}
