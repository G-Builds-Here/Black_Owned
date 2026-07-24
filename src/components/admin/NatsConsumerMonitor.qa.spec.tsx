/**
 * NATS Consumer Monitor QA Tests
 *
 * Integration and E2E tests validating the NATS Consumer Monitor feature
 * against acceptance criteria for LOC-0044-AC2.
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NatsConsumerMonitor } from "./NatsConsumerMonitor";
import * as natsMonitorModule from "@/lib/nats/nats-monitor";

// Mock UI components
jest.mock("@/components/ui/Card", () => ({
  Card: ({ children, variant, padding }: any) => (
    <div data-testid="card" data-variant={variant} data-padding={padding}>
      {children}
    </div>
  ),
}));

jest.mock("@/components/ui/Badge", () => ({
  Badge: ({ children, variant, size }: any) => (
    <span data-testid="badge" data-variant={variant} data-size={size}>
      {children}
    </span>
  ),
}));

describe("LOC-0044-AC2: NATS Consumer Monitor QA", () => {
  let mockGetConsumerStatuses: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConsumerStatuses = jest.spyOn(natsMonitorModule, "getConsumerStatuses");
  });

  afterEach(() => {
    mockGetConsumerStatuses.mockRestore();
  });

  describe("AC1: Table renders with correct columns", () => {
    it("should display all required columns: Stream Name, Consumer Name, Pending Count, Oldest Age, Status", async () => {
      const mockStatuses = [
        {
          streamName: "test-stream",
          consumerName: "test-consumer",
          pendingCount: 0,
          oldestAgeMs: null,
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("test-stream")).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify column headers exist
      expect(screen.getByText("Stream Name")).toBeInTheDocument();
      expect(screen.getByText("Consumer Name")).toBeInTheDocument();
      expect(screen.getByText("Pending Count")).toBeInTheDocument();
      expect(screen.getByText("Oldest Age")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();

      // Verify data rows render
      expect(screen.getByText("test-stream")).toBeInTheDocument();
      expect(screen.getByText("test-consumer")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  describe("AC2: Zero lag shows green status", () => {
    it("should show green dot and Healthy label for consumer with 0 pending", async () => {
      const mockStatuses = [
        {
          streamName: "orders",
          consumerName: "order-processor",
          pendingCount: 0,
          oldestAgeMs: null,
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("orders")).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify Healthy status text
      const healthyBadge = screen.getByText("Healthy");
      expect(healthyBadge).toBeInTheDocument();

      // Verify green color indicator (using inline style or class)
      const healthyIndicator = screen.getByText("Healthy").parentElement?.querySelector(".bg-heritage-jade");
      expect(healthyIndicator).toBeInTheDocument();
    });

    it("should show dash for oldest age when there are no pending messages", async () => {
      const mockStatuses = [
        {
          streamName: "events",
          consumerName: "event-handler",
          pendingCount: 0,
          oldestAgeMs: null,
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("events")).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify dash is shown for null age
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  describe("AC3: Warning at 100+ pending shows red status", () => {
    it("should show red dot and Warning label for consumer with 100+ pending", async () => {
      const mockStatuses = [
        {
          streamName: "high-lag-stream",
          consumerName: "laggy-consumer",
          pendingCount: 142,
          oldestAgeMs: 5000,
          status: "warning" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("high-lag-stream")).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify Warning status text
      const warningBadge = screen.getByText("Warning");
      expect(warningBadge).toBeInTheDocument();

      // Verify red color indicator
      const warningIndicator = screen.getByText("Warning").parentElement?.querySelector(".bg-red-600");
      expect(warningIndicator).toBeInTheDocument();
    });

    it("should display pending count in bold red text for 100+ pending", async () => {
      const mockStatuses = [
        {
          streamName: "alerts",
          consumerName: "alert-processor",
          pendingCount: 142,
          oldestAgeMs: 10000,
          status: "warning" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("alerts")).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify 142 is displayed
      const pendingCell = screen.getByText("142");
      expect(pendingCell).toBeInTheDocument();

      // Verify it has red styling (font-bold text-red-600)
      expect(pendingCell).toHaveClass("font-bold");
      expect(pendingCell).toHaveClass("text-red-600");
    });

    it("should highlight the consumer row with red background for warning status", async () => {
      const mockStatuses = [
        {
          streamName: "critical-stream",
          consumerName: "critical-consumer",
          pendingCount: 250,
          oldestAgeMs: 30000,
          status: "warning" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("critical-stream")).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify row has red background class
      const warningRow = screen.getByText("critical-consumer").closest("tr");
      expect(warningRow).toHaveClass("bg-red-50");
    });
  });

  describe("AC4: Multiple consumers from multiple streams", () => {
    it("should render all consumers from all streams in a single table", async () => {
      const mockStatuses = [
        {
          streamName: "stream-a",
          consumerName: "consumer-a1",
          pendingCount: 5,
          oldestAgeMs: 1000,
          status: "healthy" as const,
        },
        {
          streamName: "stream-a",
          consumerName: "consumer-a2",
          pendingCount: 50,
          oldestAgeMs: 2000,
          status: "healthy" as const,
        },
        {
          streamName: "stream-b",
          consumerName: "consumer-b1",
          pendingCount: 150,
          oldestAgeMs: 10000,
          status: "warning" as const,
        },
        {
          streamName: "stream-c",
          consumerName: "consumer-c1",
          pendingCount: 0,
          oldestAgeMs: null,
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getAllByText("stream-a")).toHaveLength(2);
      }, { timeout: 1000 });

      // Verify all streams are present
      expect(screen.getAllByText("stream-a")).toHaveLength(2);
      expect(screen.getByText("stream-b")).toBeInTheDocument();
      expect(screen.getByText("stream-c")).toBeInTheDocument();

      // Verify all consumers are present
      expect(screen.getByText("consumer-a1")).toBeInTheDocument();
      expect(screen.getByText("consumer-a2")).toBeInTheDocument();
      expect(screen.getByText("consumer-b1")).toBeInTheDocument();
      expect(screen.getByText("consumer-c1")).toBeInTheDocument();

      // Verify consumer count badge
      expect(screen.getByText("4 consumers")).toBeInTheDocument();
    });
  });

  describe("AC5: Age formatting", () => {
    it("should format age under 60 seconds as 'Xs'", async () => {
      const mockStatuses = [
        {
          streamName: "test-stream",
          consumerName: "test-consumer",
          pendingCount: 1,
          oldestAgeMs: 45000,
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("45s")).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it("should format age between 60 seconds and 60 minutes as 'Xm Ys'", async () => {
      const mockStatuses = [
        {
          streamName: "test-stream",
          consumerName: "test-consumer",
          pendingCount: 1,
          oldestAgeMs: 1845000, // 30 minutes 45 seconds
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("30m 45s")).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it("should format age over 60 minutes as 'Xh Ym'", async () => {
      const mockStatuses = [
        {
          streamName: "test-stream",
          consumerName: "test-consumer",
          pendingCount: 1,
          oldestAgeMs: 7260000, // 2 hours 1 minute
          status: "healthy" as const,
        },
      ];

      mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("2h 1m")).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe("Error handling", () => {
    it("should display error message when fetch fails", async () => {
      mockGetConsumerStatuses.mockRejectedValue(new Error("NATS connection refused"));

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("NATS connection refused")).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it("should show retry button on error", async () => {
      mockGetConsumerStatuses.mockRejectedValue(new Error("Connection failed"));

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe("Loading states", () => {
    it("should show loading state on initial render", async () => {
      mockGetConsumerStatuses.mockResolvedValue([]);

      render(<NatsConsumerMonitor />);

      // Initially should show loading
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });

    it("should show empty state when no streams exist", async () => {
      mockGetConsumerStatuses.mockResolvedValue([]);

      render(<NatsConsumerMonitor />);

      await waitFor(() => {
        expect(screen.getByText(/No streams or consumers found/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });
});
