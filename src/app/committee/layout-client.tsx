// src/app/committee/layout-client.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  Tags,
  Settings,
} from "lucide-react";
import RoleSidebar, { type NavItem } from "@/components/sidebar/RoleSidebar";
import type { CommitteeRole } from "@/lib/types";

export default function CommitteeLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [committeeRole, setCommitteeRole] = useState<CommitteeRole | null>(
    null,
  );
  const [pendingCompetencyProposals, setPendingCompetencyProposals] =
    useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("committee_role")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data && !cancelled) {
        setCommitteeRole((data as { committee_role: CommitteeRole | null })
          .committee_role);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pending review-queue counts. RLS lets committee members select stage rows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count: cCount } = await supabase
        .from("competencies_stage")
        .select("id", { count: "exact", head: true });
      if (cancelled) return;
      setPendingCompetencyProposals(cCount ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const portalLabel =
    committeeRole === "chief_editor" ? "Chair Portal" : "Committee Portal";

  const navItems: NavItem[] = [
    {
      href: "/committee",
      label: "Dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/committee/competencies",
      label: "Competencies",
      icon: BookOpen,
    },
    {
      href: "/committee/review-queue/competencies",
      label: "Review Queue",
      icon: ClipboardList,
      activePrefix: "/committee/review-queue",
      badge: pendingCompetencyProposals,
    },
    {
      href: "/committee/members",
      label: "Members",
      icon: Users,
    },
    {
      href: "/committee/tags",
      label: "Tags",
      icon: Tags,
      hidden: committeeRole !== "chief_editor",
    },
    {
      href: "/settings",
      label: "Profile & Settings",
      icon: Settings,
      exact: true,
    },
  ];

  return (
    <RoleSidebar
      portalLabel={portalLabel}
      homeHref="/committee"
      collapseStorageKey="committee_sidebar_collapsed"
      signOutRedirectFallback="/committee"
      navItems={navItems}
      showSupportModal
      profileChip="rich"
    >
      {children}
    </RoleSidebar>
  );
}
