"use client";

import { LayoutDashboard, Users, Settings } from "lucide-react";
import RoleSidebar, { type NavItem } from "@/components/sidebar/RoleSidebar";

const navItems: NavItem[] = [
  {
    href: "/instructor",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    // Pre-existing href/active-check mismatch — preserved verbatim per spec.
    href: "/instructor",
    label: "Trainees",
    icon: Users,
    activePrefix: "/instructor/trainee",
  },
  {
    href: "/settings",
    label: "Profile & Settings",
    icon: Settings,
    exact: true,
  },
];

export default function InstructorLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleSidebar
      portalLabel="Instructor Portal"
      homeHref="/instructor"
      collapseStorageKey="instructor_sidebar_collapsed"
      signOutRedirectFallback="/"
      navItems={navItems}
      showSupportModal
      profileChip="lean"
      leanSubtitle="Instructor"
    >
      {children}
    </RoleSidebar>
  );
}
