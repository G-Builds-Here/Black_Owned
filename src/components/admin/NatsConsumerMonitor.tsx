/**
 * NATS Consumer Monitor
 *
 * Displays a table of NATS stream consumers with pending counts and status indicators.
 */

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getConsumerStatuses, ConsumerStatus } from "@/lib/nats/nats-monitor";

/**
 * Format milliseconds to human-readable age
 */
function formatAge(ms: number | null): string {
  if (ms === null) return "—";

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * NATS Consumer Monitor Component
 */
export function NatsConsumerMonitor() {
  const [statuses, setStatuses] = useState<ConsumerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatuses = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getConsumerStatuses();
      setStatuses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch consumer statuses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && statuses.length === 0) {
    return (
      <Card variant="elevated" padding="lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-neutral-800">NATS Consumer Monitor</h2>
          <Badge variant="default" size="sm">Loading...</Badge>
        </div>
        <p className="text-neutral-500">Fetching consumer data...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="elevated" padding="lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-neutral-800">NATS Consumer Monitor</h2>
          <Badge variant="error" size="sm">Error</Badge>
        </div>
        <p className="text-neutral-500">{error}</p>
        <button
          onClick={fetchStatuses}
          className="mt-4 text-sm text-heritage-royal hover:underline"
        >
          Retry
        </button>
      </Card>
    );
  }

  if (statuses.length === 0) {
    return (
      <Card variant="elevated" padding="lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-neutral-800">NATS Consumer Monitor</h2>
          <Badge variant="default" size="sm">No Data</Badge>
        </div>
        <p className="text-neutral-500">No streams or consumers found.</p>
      </Card>
    );
  }

  return (
    <Card variant="elevated" padding="lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-neutral-800">NATS Consumer Monitor</h2>
          <Badge variant="primary" size="sm">
            {statuses.length} consumer{statuses.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <button
          onClick={fetchStatuses}
          className="text-sm text-heritage-royal hover:underline"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="pb-3 font-semibold text-neutral-600">Stream Name</th>
              <th className="pb-3 font-semibold text-neutral-600">Consumer Name</th>
              <th className="pb-3 font-semibold text-neutral-600">Pending Count</th>
              <th className="pb-3 font-semibold text-neutral-600">Oldest Age</th>
              <th className="pb-3 font-semibold text-neutral-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status, index) => (
              <tr
                key={`${status.streamName}-${status.consumerName}`}
                className={`border-b border-neutral-100 ${
                  status.status === "warning" ? "bg-red-50" : ""
                }`}
              >
                <td className="py-3 text-neutral-800">{status.streamName}</td>
                <td className="py-3 text-neutral-800">{status.consumerName}</td>
                <td className="py-3">
                  {status.pendingCount >= 100 ? (
                    <span className="font-bold text-red-600">{status.pendingCount}</span>
                  ) : (
                    <span className="text-neutral-800">{status.pendingCount}</span>
                  )}
                </td>
                <td className="py-3 text-neutral-600">
                  {formatAge(status.oldestAgeMs)}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        status.status === "healthy"
                          ? "bg-heritage-jade"
                          : "bg-red-600"
                      }`}
                    />
                    <span
                      className={
                        status.status === "healthy"
                          ? "text-neutral-600"
                          : "text-red-600 font-medium"
                      }
                    >
                      {status.status === "healthy" ? "Healthy" : "Warning"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
