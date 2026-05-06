// src/app/trainee/layout.tsx
import { getSupabaseServer } from "@/lib/supabaseServer";
import { attachUserToSentry } from "@/lib/sentry/user-context";
import TraineeLayoutClient from "./layout-client";

export default async function TraineeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  await attachUserToSentry(supabase);
  return <TraineeLayoutClient>{children}</TraineeLayoutClient>;
}
