import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const mockSupabaseClient = { from: jest.fn() };

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const service = await import('../../services/referenceQuality.service.js');

describe('referenceQuality.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scores a long specific reference above a short generic reference', () => {
    const detailed = service.computeReferenceQualityFromText(
      'She led the payroll migration project, coordinated weekly checkpoints with finance and engineering, and delivered the rollout before the Q3 deadline. During the launch, she documented risks, trained two coordinators, and resolved reporting issues within one day.'
    );
    const generic = service.computeReferenceQualityFromText('Great person and good worker.');

    expect(detailed.qualityScore).toBeGreaterThan(generic.qualityScore);
    expect(detailed.dimensions.specificity).toBeGreaterThan(generic.dimensions.specificity);
  });

  it('increases the examples score when concrete examples are present', () => {
    const withoutExamples = service.computeReferenceQualityFromText(
      'He managed client work and communicated clearly with the team across the project.'
    );
    const withExamples = service.computeReferenceQualityFromText(
      'He managed client work and communicated clearly with the team. For example, during the March release he organized a recovery plan when a vendor slipped by two days.'
    );

    expect(withExamples.dimensions.examples).toBeGreaterThan(withoutExamples.dimensions.examples);
    expect(withExamples.qualityScore).toBeGreaterThan(withoutExamples.qualityScore);
  });

  it('allows constructive negative feedback to still score well', () => {
    const result = service.computeReferenceQualityFromText(
      'She was dependable and professional, but she could improve executive-level communication. During the budget review, she responded well to feedback, revised the deck the same day, and shared a clearer update plan for the next meeting.'
    );

    expect(result.dimensions.constructiveTone).toBeGreaterThanOrEqual(0.65);
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.6);
    expect(['moderate', 'strong']).toContain(result.band);
  });

  it('keeps vague praise in the limited band', () => {
    const result = service.computeReferenceQualityFromText(
      'Great person. Nice team player. Very good worker.'
    );

    expect(result.band).toBe('limited');
    expect(result.dimensions.specificity).toBeLessThan(0.45);
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it('returns deterministic output for the same text', () => {
    const text = 'During the product launch, he coordinated support tickets, documented fixes, and trained the new onboarding specialist.';

    const first = service.computeReferenceQualityFromText(text, { referenceId: 'ref-1' });
    const second = service.computeReferenceQualityFromText(text, { referenceId: 'ref-1' });

    expect(first).toEqual(second);
  });

  it('always includes human-readable explanations', () => {
    const result = service.computeReferenceQualityFromText(
      'During the audit, she documented issues, assigned owners, and followed up on every remediation item.'
    );

    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation.every((entry) => typeof entry === 'string' && entry.length > 0)).toBe(true);
  });

  it('applies band thresholds consistently', () => {
    expect(service.computeReferenceQualityFromText('Great person.').band).toBe('limited');
    const moderate = service.computeReferenceQualityFromText(
      'He managed the support queue, documented recurring issues, and during the weekly operations review explained the handoff process clearly to the team.'
    );
    const strong = service.computeReferenceQualityFromText(
      'She led the billing reconciliation project, defined ownership across finance and operations, and during the quarter-end close she resolved a reporting gap within hours and documented the process for the team.'
    );

    expect(['moderate', 'strong']).toContain(moderate.band);
    expect(strong.qualityScore).toBeGreaterThan(moderate.qualityScore);
  });
});
