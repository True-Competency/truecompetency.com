import RootPage from "./page.client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function StatsLoader() {
  const supabase = getSupabaseAdmin();

  const [
    { count: competenciesCount },
    { count: committeeMembersCount },
    { count: questionsCount },
    { data: countryRows },
  ] = await Promise.all([
    supabase.from("competencies").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "committee"),
    supabase
      .from("competency_questions")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("country_code")
      .not("country_code", "is", null),
  ]);

  const countries = new Set(
    (countryRows ?? [])
      .map((row) => row.country_code)
      .filter((code): code is string => Boolean(code)),
  ).size;

  return (
    <RootPage
      stats={{
        competencies: competenciesCount ?? 0,
        committeeMembers: committeeMembersCount ?? 0,
        questions: questionsCount ?? 0,
        countries,
      }}
    />
  );
}

export default function Page() {
  return <StatsLoader />;
}
