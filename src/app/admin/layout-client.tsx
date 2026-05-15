"use client";

import {
  ShieldCheck,
  Users,
  GraduationCap,
  BookOpen,
  Settings,
} from "lucide-react";
import RoleSidebar, { type NavItem } from "@/components/sidebar/RoleSidebar";

const navItems: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: ShieldCheck,
    exact: true,
  },
  {
    href: "/committee",
    label: "Committee",
    icon: Users,
  },
  {
    href: "/instructor",
    label: "Instructor",
    icon: GraduationCap,
  },
  {
    href: "/trainee",
    label: "Trainee",
    icon: BookOpen,
  },
  {
    href: "/settings",
    label: "Profile & Settings",
    icon: Settings,
    exact: true,
  },
];

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleSidebar
      portalLabel="Admin Portal"
      homeHref="/admin"
      collapseStorageKey="admin_sidebar_collapsed"
      signOutRedirectFallback="/admin"
      navItems={navItems}
      showSupportModal={false}
      profileChip="lean"
      leanSubtitle="Admin"
    >
      {children}
    </RoleSidebar>
  );
}
