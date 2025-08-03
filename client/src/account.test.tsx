import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
// Mock heavy lazy components used within the app to simplify testing
vi.mock("@/components/lazy-components", () => ({
  TacticsModal: () => null,
  GameModal: () => null,
  StudyModal: () => null,
  GoalModal: () => null,
  WeeklyActivityChart: () => null,
  DataManagement: () => <div>Data Management</div>,
  AccountPage: () => <div>Account
    <div>Data Management</div>
  </div>,
}));

import App from "@/App";

describe("account route", () => {
  afterEach(() => cleanup());

  it("renders account tab in navigation", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
  });

  it("navigates to account page and loads data management", async () => {
    render(<App />);
    const accountTab = screen.getByRole("button", { name: /account/i });
    fireEvent.click(accountTab);
    expect(await screen.findByText(/data management/i)).toBeInTheDocument();
  });
});
