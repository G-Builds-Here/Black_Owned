/**
 * Enrichment Panel
 *
 * Admin trigger + report for bw-scraper enrichment runs: pick a limit,
 * hit "Enrich business content", and the per-business report (applied,
 * skipped, and failed fields with their reasons) renders as a table.
 * Report rows reuse the ui/ Table primitives; the POST goes through the
 * admin-gated /api/admin/enrichment proxy.
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Button,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
} from '@/components/ui';
import { clearSession, authHeaders } from '@/lib/auth/client-session';

interface EnrichBusinessResult {
  id: string;
  name: string;
  applied: string[];
  skipped: string[];
  error: string | null;
}

interface EnrichSummary {
  total: number;
  enriched: number;
  skipped: number;
  failed: number;
}

interface EnrichReport {
  businesses: EnrichBusinessResult[];
  summary: EnrichSummary;
}

export default function EnrichmentPanel() {
  const router = useRouter();
  const [limit, setLimit] = useState('10');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<EnrichReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEnrich = async () => {
    if (running) return;
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      setError('Limit must be between 1 and 500');
      return;
    }
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch('/api/admin/enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ limit: parsedLimit }),
      });
      if (response.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      const result = await response.json();
      if (result.success) {
        setReport(result.data.report as EnrichReport);
      } else {
        setError(result.error || 'Enrichment run failed');
      }
    } catch {
      setError('Enrichment worker unreachable');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card variant="elevated" padding="lg" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Business content enrichment</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Run the fill-empty enrichment pipeline over up to N businesses and see exactly
          which fields were applied, skipped, or failed.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="w-40">
          <Input
            label="Limit"
            id="enrichment-limit"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            helperText="Max 500 businesses per run"
            fullWidth
          />
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleEnrich}
          isLoading={running}
          loadingText="Enriching..."
        >
          Enrich business content
        </Button>
      </div>

      {error && (
        <div role="status" className="p-3 rounded-lg bg-red-100 text-red-800">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            {report.summary.total} businesses · {report.summary.enriched} enriched ·{' '}
            {report.summary.skipped} skipped · {report.summary.failed} failed
          </p>
          <Table aria-label="Enrichment report">
            <TableHeader>
              <tr>
                <TableColumn>Name</TableColumn>
                <TableColumn>Applied</TableColumn>
                <TableColumn>Skipped</TableColumn>
                <TableColumn>Error</TableColumn>
              </tr>
            </TableHeader>
            <TableBody>
              {report.businesses.map((business) => (
                <TableRow key={business.id}>
                  <TableCell>{business.name}</TableCell>
                  <TableCell>
                    {business.applied.length > 0 ? business.applied.join(', ') : '—'}
                  </TableCell>
                  <TableCell>
                    {business.skipped.length > 0 ? business.skipped.join(', ') : '—'}
                  </TableCell>
                  <TableCell className={business.error ? 'text-red-700' : ''}>
                    {business.error || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
