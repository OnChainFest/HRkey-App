import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const tableData = {
  roles: {
    'candidate-growth': [
      { id: 'r1', owner_id: 'candidate-growth', title: 'Software Engineer', company: 'Acme', start_date: '2019-01-01', end_date: '2020-12-31' },
      { id: 'r2', owner_id: 'candidate-growth', title: 'Senior Software Engineer', company: 'Acme', start_date: '2021-01-01', end_date: '2022-06-30' },
      { id: 'r3', owner_id: 'candidate-growth', title: 'Engineering Manager', company: 'Acme', start_date: '2022-07-01', end_date: '2024-01-01' }
    ],
    'candidate-flat': [
      { id: 'f1', owner_id: 'candidate-flat', title: 'Product Analyst', company: 'Beta', start_date: '2021-01-01', end_date: '2022-01-01' },
      { id: 'f2', owner_id: 'candidate-flat', title: 'Product Analyst', company: 'Gamma', start_date: '2022-02-01', end_date: '2023-02-01' },
      { id: 'f3', owner_id: 'candidate-flat', title: 'Product Analyst', company: 'Delta', start_date: '2023-03-01', end_date: '2024-03-01' }
    ],
    'candidate-sparse': [
      { id: 's1', owner_id: 'candidate-sparse', title: 'Operations Specialist', company: 'LeanCo', start_date: '2023-01-01', end_date: null }
    ],
    'candidate-missing-dates': [
      { id: 'm1', owner_id: 'candidate-missing-dates', title: 'Engineer', company: 'Acme', start_date: null, end_date: null },
      { id: 'm2', owner_id: 'candidate-missing-dates', title: 'Senior Engineer', company: 'Acme', start_date: null, end_date: null }
    ],
    'candidate-noisy': [
      { id: 'n1', owner_id: 'candidate-noisy', title: 'Wizard / Ninja', company: 'Startup', start_date: '2022-01-01', end_date: '2023-01-01' },
      { id: 'n2', owner_id: 'candidate-noisy', title: 'Growth Hero', company: 'Startup', start_date: '2023-02-01', end_date: null }
    ],
    'candidate-none': []
  },
  positions: {},
  references: {
    'candidate-growth': [
      { id: 'ref1', owner_id: 'candidate-growth', summary: 'Led a team migration', detailed_feedback: { strengths: 'Owned delivery, mentored two engineers, and managed roadmap sequencing.' }, created_at: '2024-02-01' }
    ],
    'candidate-flat': [],
    'candidate-sparse': [],
    'candidate-missing-dates': [
      { id: 'ref2', owner_id: 'candidate-missing-dates', summary: 'Mentored teammates on system design.', detailed_feedback: {}, created_at: '2024-04-01' }
    ],
    'candidate-noisy': [],
    'candidate-none': []
  }
};

const mockSupabaseClient = {
  from: jest.fn((table) => ({
    select: jest.fn(() => ({
      eq: jest.fn((field, candidateId) => ({
        order: jest.fn(async () => ({ data: (tableData[table] && tableData[table][candidateId]) || [], error: null }))
      }))
    }))
  }))
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const service = await import('../../services/careerTrajectory.service.js');

function expectNoInvalidNumbers(value) {
  if (Array.isArray(value)) return value.forEach(expectNoInvalidNumbers);
  if (value && typeof value === 'object') return Object.values(value).forEach(expectNoInvalidNumbers);
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  expect(value).not.toBeUndefined();
}

describe('careerTrajectory.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures normal career progression conservatively', async () => {
    const result = await service.computeCareerTrajectory('candidate-growth');

    expect(result.signals.promotionVelocity.band).toBe('strong');
    expect(result.signals.roleComplexityProgression.band).toBe('strong');
    expect(['moderate', 'strong']).toContain(result.signals.leadershipDevelopment.band);
    expect(result.summary).not.toMatch(/high potential|top performer|future leader/i);
    expectNoInvalidNumbers(result);
  });

  it('keeps flat careers limited without forcing promotions', async () => {
    const result = await service.computeCareerTrajectory('candidate-flat');

    expect(result.signals.promotionVelocity.band).toBe('limited');
    expect(result.signals.roleComplexityProgression.band).toBe('limited');
    expect(result.signals.promotionVelocity.explanation[0]).toMatch(/No clear upward title changes/i);
    expectNoInvalidNumbers(result);
  });

  it('returns limited partial signals for sparse data', async () => {
    const result = await service.computeCareerTrajectory('candidate-sparse');

    expect(result.signals.promotionVelocity.band).toBe('limited');
    expect(result.signals.leadershipDevelopment.band).toBe('limited');
    expect(result.caveats.join(' ')).toMatch(/Only one role|at least two historical roles/i);
    expectNoInvalidNumbers(result);
  });

  it('handles missing dates without NaN values', async () => {
    const result = await service.computeCareerTrajectory('candidate-missing-dates');

    expect(result.signals.promotionVelocity.caveats.join(' ')).toMatch(/Missing or partial date fields/i);
    expectNoInvalidNumbers(result);
  });

  it('downgrades noisy titles with explicit caveats', async () => {
    const result = await service.computeCareerTrajectory('candidate-noisy');

    expect(result.signals.roleComplexityProgression.band).toBe('limited');
    expect(result.caveats.join(' ')).toMatch(/unresolved|noisy labels/i);
    expectNoInvalidNumbers(result);
  });

  it('returns empty signals when no role history exists', async () => {
    const result = await service.computeCareerTrajectory('candidate-none');

    expect(result.signals).toEqual({});
    expect(result.summary).toMatch(/Insufficient role history/i);
    expectNoInvalidNumbers(result);
  });
});
