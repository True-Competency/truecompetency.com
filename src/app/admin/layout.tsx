// src/app/admin/layout.tsx
import { getSupabaseServer } from "@/lib/supabaseServer";
import { attachUserToSentry } from "@/lib/sentry/user-context";
import AdminLayoutClient from "./layout-client";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  await attachUserToSentry(supabase);
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
