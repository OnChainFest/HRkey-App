import { jest } from '@jest/globals';

const mockFrom = jest.fn();
const mockCreateClient = jest.fn(() => ({ from: mockFrom }));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: mockCreateClient
}));

const { getAdminOverview } = await import('../../services/adminOverview.service.js');

describe('adminOverview.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns aggregated metrics from all sources', async () => {
    const auditRows = [
      { created_at: new Date().toISOString() },
      { created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
    ];
    const revenueRows = [
      { amount: 50, created_at: new Date().toISOString() },
      { amount: 25, created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() }
    ];
    const dataAccessRows = [
      { status: 'PENDING' },
      { status: 'APPROVED' },
      { status: 'REJECTED' },
      { status: 'APPROVED' }
    ];
    const kpiRows = [
      { created_at: new Date().toISOString() },
      { created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }
    ];

    mockFrom.mockImplementation((table) => ({
      select: jest.fn(() => {
        if (table === 'audit_logs') return Promise.resolve({ data: auditRows, error: null });
        if (table === 'revenue_transactions') return Promise.resolve({ data: revenueRows, error: null });
        if (table === 'data_access_requests') return Promise.resolve({ data: dataAccessRows, error: null });
        if (table === 'kpi_observations') return Promise.resolve({ data: kpiRows, error: null });
        return Promise.resolve({ data: [], error: null });
      })
    }));

    const overview = await getAdminOverview();

    expect(overview.auditEvents.total).toBe(2);
    expect(overview.auditEvents.last24h).toBe(1);
    expect(overview.revenue.totalUsd).toBe(75);
    expect(overview.revenue.last30dUsd).toBe(50);
    expect(overview.dataAccessRequests).toEqual({ total: 4, pending: 1, approved: 2, rejected: 1 });
    expect(overview.kpiObservations.total).toBe(2);
    expect(overview.kpiObservations.last30d).toBe(2);
  });

  test('defaults a failing section to zeroes without throwing', async () => {
    const auditRows = [{ created_at: new Date().toISOString() }];

    mockFrom.mockImplementation((table) => ({
      select: jest.fn(() => {
        if (table === 'audit_logs') return Promise.resolve({ data: auditRows, error: null });
        if (table === 'revenue_transactions') return Promise.resolve({ data: null, error: new Error('rev fail') });
        if (table === 'data_access_requests') return Promise.resolve({ data: null, error: new Error('da fail') });
        if (table === 'kpi_observations') return Promise.resolve({ data: null, error: new Error('kpi fail') });
        return Promise.resolve({ data: [], error: null });
      })
    }));

    const overview = await getAdminOverview();

    expect(overview.auditEvents.total).toBe(1);
    expect(overview.revenue).toEqual({ totalUsd: 0, last30dUsd: 0 });
    expect(overview.dataAccessRequests).toEqual({ total: 0, pending: 0, approved: 0, rejected: 0 });
    expect(overview.kpiObservations).toEqual({ total: 0, last30d: 0 });
  });
});
