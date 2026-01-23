import { z } from 'zod';

export const consentSchema = z.object({
  consent_id: z.string().min(1),
  subject: z.string().min(1),
  grantee: z.string().min(1),
  purpose: z.string().min(1),
  scope: z.record(z.any()),
  duration_from: z.string().datetime(),
  duration_to: z.string().datetime(),
  revocable: z.boolean()
});

export const viewIssuanceSchema = z.object({
  view: z.object({
    view_id: z.string().min(1),
    subject: z.string().min(1),
    schema_id: z.string().min(1),
    linked_statements: z.record(z.string()),
    generated_at: z.string().datetime()
  }),
  consent_id: z.string().min(1)
});
