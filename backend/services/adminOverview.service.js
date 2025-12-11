import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function withinWindow(dateString, windowStart) {
  if (!dateString) return false;
  const ts = new Date(dateString).getTime();
  return Number.isFinite(ts) && ts >= windowStart.getTime();
}

async function fetchRows(table, columns = '*') {
  const { data, error } = await supabaseClient.from(table).select(columns);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getAuditEventStats() {
  try {
    const rows = await fetchRows('audit_logs', 'created_at');
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      total: rows.length,
      last24h: rows.filter((row) => withinWindow(row.created_at, last24h)).length,
      last7d: rows.filter((row) => withinWindow(row.created_at, last7d)).length
    };
  } catch (err) {
    console.error('Failed to compute audit event stats', err);
    return { total: 0, last24h: 0, last7d: 0 };
  }
}

async function getRevenueStats() {
  try {
    const rows = await fetchRows('revenue_transactions', 'amount, created_at');
    const now = new Date();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalUsd = rows.reduce((sum, row) => sum + safeNumber(row.amount), 0);
    const last30dUsd = rows
      .filter((row) => withinWindow(row.created_at, last30d))
      .reduce((sum, row) => sum + safeNumber(row.amount), 0);

    return { totalUsd, last30dUsd };
  } catch (err) {
    console.error('Failed to compute revenue stats', err);
    return { totalUsd: 0, last30dUsd: 0 };
  }
}

async function getDataAccessStats() {
  try {
    const rows = await fetchRows('data_access_requests', 'status, created_at');
    const totals = {
      total: rows.length,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    rows.forEach((row) => {
      const status = (row.status || '').toUpperCase();
      if (status === 'PENDING') totals.pending += 1;
      if (status === 'APPROVED') totals.approved += 1;
      if (status === 'REJECTED') totals.rejected += 1;
    });

    return totals;
  } catch (err) {
    console.error('Failed to compute data access stats', err);
    return { total: 0, pending: 0, approved: 0, rejected: 0 };
  }
}

async function getKpiObservationStats() {
  try {
    const rows = await fetchRows('kpi_observations', 'created_at');
    const now = new Date();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      total: rows.length,
      last30d: rows.filter((row) => withinWindow(row.created_at, last30d)).length
    };
  } catch (err) {
    console.error('Failed to compute KPI observation stats', err);
    return { total: 0, last30d: 0 };
  }
}

/**
 * Aggregate core admin metrics for superadmin dashboards.
 * @returns {Promise<{ auditEvents: { total: number, last24h: number, last7d: number }, revenue: { totalUsd: number, last30dUsd: number }, dataAccessRequests: { total: number, pending: number, approved: number, rejected: number }, kpiObservations: { total: number, last30d: number } }>}
 */
export async function getAdminOverview() {
  const [auditEvents, revenue, dataAccessRequests, kpiObservations] = await Promise.all([
    getAuditEventStats(),
    getRevenueStats(),
    getDataAccessStats(),
    getKpiObservationStats()
  ]);

  return {
    auditEvents,
    revenue,
    dataAccessRequests,
    kpiObservations
  };
}

export default {
  getAdminOverview
};
