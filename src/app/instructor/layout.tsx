// src/app/instructor/layout.tsx
import { getSupabaseServer } from "@/lib/supabaseServer";
import { attachUserToSentry } from "@/lib/sentry/user-context";
import InstructorLayoutClient from "./layout-client";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  await attachUserToSentry(supabase);
  return <InstructorLayoutClient>{children}</InstructorLayoutClient>;
}
