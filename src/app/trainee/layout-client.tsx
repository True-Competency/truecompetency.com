// src/app/trainee/layout-client.tsx
"use client";

import {
  LayoutDashboard,
  BookOpen,
  BarChart2,
  Bell,
  Settings,
} from "lucide-react";
import RoleSidebar, { type NavItem } from "@/components/sidebar/RoleSidebar";

const navItems: NavItem[] = [
  {
    href: "/trainee",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/trainee/progress",
    label: "My Progress",
    icon: BarChart2,
  },
  {
    href: "/trainee/competencies",
    label: "Competencies",
    icon: BookOpen,
  },
  {
    href: "/trainee/notifications",
    label: "Activity",
    icon: Bell,
  },
  {
    href: "/settings",
    label: "Profile & Settings",
    icon: Settings,
    exact: true,
  },
];

export default function TraineeLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleSidebar
      portalLabel="Trainee Portal"
      homeHref="/trainee"
      collapseStorageKey="trainee_sidebar_collapsed"
      signOutRedirectFallback="/trainee"
      navItems={navItems}
      showSupportModal
      profileChip="rich"
    >
      {children}
    </RoleSidebar>
  );
}
