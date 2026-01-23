import type { Consent, MarketSchema } from './types';

const DEFAULT_DURATION_DAYS = 30;

export function buildConsent(params: {
  subject: string;
  schema: MarketSchema;
  keys: string[];
  durationDays?: number;
}): Consent {
  const now = new Date();
  const durationDays = params.durationDays ?? DEFAULT_DURATION_DAYS;
  const durationFrom = now.toISOString();
  const durationTo = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    consent_id: `consent:${crypto.randomUUID()}`,
    subject: params.subject,
    grantee: params.schema.grantee,
    purpose: params.schema.purpose,
    scope: {
      schema_id: params.schema.id,
      keys: params.keys,
      subject_did: params.subject
    },
    duration_from: durationFrom,
    duration_to: durationTo,
    revocable: true
  };
}
