// src/app/committee/layout.tsx
import { getSupabaseServer } from "@/lib/supabaseServer";
import { attachUserToSentry } from "@/lib/sentry/user-context";
import CommitteeLayoutClient from "./layout-client";

export default async function CommitteeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  await attachUserToSentry(supabase);
  return <CommitteeLayoutClient>{children}</CommitteeLayoutClient>;
}
