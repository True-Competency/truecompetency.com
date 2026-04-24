// src/tests/utils.test.ts
// Unit tests for pure utility functions — no external dependencies needed

import { describe, it, expect } from "vitest";

// ── Difficulty color helper ───────────────────────────────────────────────────
// Mirrors the diffColor function used across competency pages

function diffColor(difficulty: string | null): string {
  switch ((difficulty ?? "").toLowerCase()) {
    case "beginner":
      return "var(--ok)";
    case "intermediate":
      return "var(--warn)";
    case "expert":
      return "var(--err)";
    case "advanced":
      return "var(--err)";
    default:
      return "var(--border)";
  }
}

describe("diffColor", () => {
  it("returns ok for beginner", () => {
    expect(diffColor("Beginner")).toBe("var(--ok)");
  });

  it("returns ok for lowercase beginner", () => {
    expect(diffColor("beginner")).toBe("var(--ok)");
  });

  it("returns warn for intermediate", () => {
    expect(diffColor("Intermediate")).toBe("var(--warn)");
  });

  it("returns err for expert", () => {
    expect(diffColor("Expert")).toBe("var(--err)");
  });

  it("returns err for advanced", () => {
    expect(diffColor("Advanced")).toBe("var(--err)");
  });

  it("returns border for unknown difficulty", () => {
    expect(diffColor("unknown")).toBe("var(--border)");
  });

  it("returns border for null", () => {
    expect(diffColor(null)).toBe("var(--border)");
  });

  it("returns border for empty string", () => {
    expect(diffColor("")).toBe("var(--border)");
  });
});

// ── Progress percentage calculation ───────────────────────────────────────────
// Mirrors the overallPct calculation used in trainee dashboard

function calcOverallPct(completed: number, enrolled: number): number {
  if (enrolled === 0) return 0;
  return Math.round((completed / enrolled) * 100);
}

describe("calcOverallPct", () => {
  it("returns 0 when nothing enrolled", () => {
    expect(calcOverallPct(0, 0)).toBe(0);
  });

  it("returns 0 when enrolled but none completed", () => {
    expect(calcOverallPct(0, 10)).toBe(0);
  });

  it("returns 100 when all completed", () => {
    expect(calcOverallPct(10, 10)).toBe(100);
  });

  it("returns 50 when half completed", () => {
    expect(calcOverallPct(5, 10)).toBe(50);
  });

  it("rounds correctly", () => {
    expect(calcOverallPct(1, 3)).toBe(33);
  });
});

// ── Accuracy percentage calculation ───────────────────────────────────────────
// Mirrors the accuracyPct calculation in trainee dashboard

function calcAccuracyPct(correct: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((correct / total) * 100);
}

describe("calcAccuracyPct", () => {
  it("returns null when no answers", () => {
    expect(calcAccuracyPct(0, 0)).toBeNull();
  });

  it("returns 100 when all correct", () => {
    expect(calcAccuracyPct(10, 10)).toBe(100);
  });

  it("returns 0 when all wrong", () => {
    expect(calcAccuracyPct(0, 10)).toBe(0);
  });

  it("rounds correctly", () => {
    expect(calcAccuracyPct(2, 3)).toBe(67);
  });
});

// ── Relative time formatting ───────────────────────────────────────────────────
// Mirrors the formatRelativeTime function in trainee notifications page

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

describe("formatRelativeTime", () => {
  it("returns just now for recent timestamp", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });
});

// ── Display name resolution ────────────────────────────────────────────────────
// Mirrors getDisplayName used across dashboard pages

type Profile = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function getDisplayName(p: Profile | null): string {
  if (!p) return "";
  return (
    p.full_name ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    p.email ||
    "there"
  );
}

describe("getDisplayName", () => {
  it("returns empty string for null profile", () => {
    expect(getDisplayName(null)).toBe("");
  });

  it("prefers full_name over first+last", () => {
    expect(
      getDisplayName({
        full_name: "John Doe",
        first_name: "John",
        last_name: "Doe",
        email: "john@example.com",
      }),
    ).toBe("John Doe");
  });

  it("falls back to first + last name", () => {
    expect(
      getDisplayName({
        full_name: null,
        first_name: "John",
        last_name: "Doe",
        email: "john@example.com",
      }),
    ).toBe("John Doe");
  });

  it("falls back to email when no name", () => {
    expect(
      getDisplayName({
        full_name: null,
        first_name: null,
        last_name: null,
        email: "john@example.com",
      }),
    ).toBe("john@example.com");
  });

  it("falls back to 'there' when nothing available", () => {
    expect(
      getDisplayName({
        full_name: null,
        first_name: null,
        last_name: null,
        email: null,
      }),
    ).toBe("there");
  });
});

// ── Email validation ───────────────────────────────────────────────────────────
// Mirrors isValidEmail used in settings and API routes

function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

describe("isValidEmail", () => {
  it("accepts valid email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(isValidEmail("user@mail.example.com")).toBe(true);
  });

  it("rejects email without @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects email without domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
});
