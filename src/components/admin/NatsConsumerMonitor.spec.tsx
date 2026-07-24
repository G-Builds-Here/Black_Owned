/**
 * NATS Consumer Monitor Component Tests
 *
 * Tests for the NatsConsumerMonitor React component.
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

describe("NatsConsumerMonitor", () => {
  let mockGetConsumerStatuses: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConsumerStatuses = jest.spyOn(natsMonitorModule, "getConsumerStatuses");
  });

  afterEach(() => {
    mockGetConsumerStatuses.mockRestore();
  });

  it("should show loading state when fetching data", async () => {
    mockGetConsumerStatuses.mockResolvedValue([]);

    render(<NatsConsumerMonitor />);

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/No streams or consumers found/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("should show error state when fetch fails", async () => {
    mockGetConsumerStatuses.mockRejectedValue(new Error("Connection failed"));

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("should show empty state when no consumers found", async () => {
    mockGetConsumerStatuses.mockResolvedValue([]);

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/No streams or consumers found/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("should render consumer table with healthy status for 0 pending", async () => {
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

    expect(screen.getByText("order-processor")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("should render consumer table with warning status for 100+ pending", async () => {
    const mockStatuses = [
      {
        streamName: "events",
        consumerName: "event-handler",
        pendingCount: 142,
        oldestAgeMs: 5000,
        status: "warning" as const,
      },
    ];

    mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getByText("events")).toBeInTheDocument();
    }, { timeout: 1000 });

    expect(screen.getByText("event-handler")).toBeInTheDocument();

    // Pending count should be 142
    const pendingCell = screen.getByText("142");
    expect(pendingCell).toBeInTheDocument();

    // Should show Warning status
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("should render multiple consumers from multiple streams", async () => {
    const mockStatuses = [
      {
        streamName: "stream-1",
        consumerName: "consumer-a",
        pendingCount: 5,
        oldestAgeMs: 1000,
        status: "healthy" as const,
      },
      {
        streamName: "stream-1",
        consumerName: "consumer-b",
        pendingCount: 50,
        oldestAgeMs: 2000,
        status: "healthy" as const,
      },
      {
        streamName: "stream-2",
        consumerName: "consumer-c",
        pendingCount: 200,
        oldestAgeMs: 10000,
        status: "warning" as const,
      },
    ];

    mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getAllByText("stream-1")).toHaveLength(2);
    }, { timeout: 1000 });

    // Check all stream names are present
    expect(screen.getAllByText("stream-1")).toHaveLength(2);
    expect(screen.getByText("stream-2")).toBeInTheDocument();

    // Check all consumer names are present
    expect(screen.getAllByText("consumer-a")).toHaveLength(1);
    expect(screen.getAllByText("consumer-b")).toHaveLength(1);
    expect(screen.getAllByText("consumer-c")).toHaveLength(1);

    // Check consumer count badge
    expect(screen.getByText("3 consumers")).toBeInTheDocument();
  });

  it("should format age correctly", async () => {
    const mockStatuses = [
      {
        streamName: "test-stream",
        consumerName: "test-consumer",
        pendingCount: 1,
        oldestAgeMs: 45000, // 45 seconds
        status: "healthy" as const,
      },
    ];

    mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getByText("45s")).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("should show dash for null age", async () => {
    const mockStatuses = [
      {
        streamName: "test-stream",
        consumerName: "test-consumer",
        pendingCount: 1,
        oldestAgeMs: null,
        status: "healthy" as const,
      },
    ];

    mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("should call refresh on button click", async () => {
    const mockStatuses = [
      {
        streamName: "orders",
        consumerName: "processor",
        pendingCount: 0,
        oldestAgeMs: null,
        status: "healthy" as const,
      },
    ];

    mockGetConsumerStatuses.mockResolvedValue(mockStatuses);

    render(<NatsConsumerMonitor />);

    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    }, { timeout: 1000 });

    const refreshButton = screen.getByText("Refresh");
    const initialCallCount = mockGetConsumerStatuses.mock.calls.length;

    await act(async () => {
      refreshButton.click();
    });

    // Should have been called one more time
    expect(mockGetConsumerStatuses.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
