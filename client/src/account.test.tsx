import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/lazy-components", () => ({
  WeeklyActivityChart: () => null,
  DataManagement: () => <div>Data Management</div>,
}));

vi.mock("@/lib/firebase-utils", () => ({
  getStatistics: async () => ({ totalHours: 0, totalSessions: 0, tacticsRating: 0, winRate: 0 }),
  getAllSessions: async () => [],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

import Navigation from "@/components/layout/navigation";
import Dashboard from "@/pages/dashboard";
import Account from "@/pages/account";

describe("data management location", () => {
  afterEach(() => cleanup());

  it("shows account tab in navigation", () => {
    render(<Navigation />);
    expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
  });

  it("renders data management only on account page", async () => {
    render(<Dashboard />);
    expect(screen.queryByText(/data management/i)).not.toBeInTheDocument();
    cleanup();
    render(<Account />);
    expect(await screen.findByText(/data management/i)).toBeInTheDocument();
  });
});
