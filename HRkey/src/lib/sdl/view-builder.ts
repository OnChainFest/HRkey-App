import type { Consent, MarketSchema, View } from './types';
import { buildConsent } from './consent';

export function buildView(params: {
  subject: string;
  schemaId: string;
  linkedStatements: Record<string, string>;
  viewId?: string;
  generatedAt?: string;
}): View {
  return {
    view_id: params.viewId ?? `view:${crypto.randomUUID()}`,
    subject: params.subject,
    schema_id: params.schemaId,
    linked_statements: params.linkedStatements,
    generated_at: params.generatedAt ?? new Date().toISOString()
  };
}

export function buildViewAndConsent(params: {
  subject: string;
  schema: MarketSchema;
  linkedStatements: Record<string, string>;
  durationDays?: number;
}): { view: View; consent: Consent } {
  const keys = Object.keys(params.linkedStatements);
  const view = buildView({
    subject: params.subject,
    schemaId: params.schema.id,
    linkedStatements: params.linkedStatements
  });
  const consent = buildConsent({
    subject: params.subject,
    schema: params.schema,
    keys,
    durationDays: params.durationDays
  });

  return { view, consent };
}
