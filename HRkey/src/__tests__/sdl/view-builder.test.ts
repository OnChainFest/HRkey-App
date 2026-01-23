import { buildViewAndConsent } from '@/lib/sdl/view-builder';
import type { MarketSchema } from '@/lib/sdl/types';

describe('buildViewAndConsent', () => {
  it('maps linked statements and consent scope', () => {
    const schema: MarketSchema = {
      id: 'market:mm2:v1',
      title: 'MM2',
      grantee: 'market:mm2',
      purpose: 'reuse',
      fields: [
        { key: 'email', label: 'Email', type: 'string' },
        { key: 'city', label: 'City', type: 'string' }
      ]
    };

    const linkedStatements = {
      email: 'sdl:stmt:1',
      city: 'sdl:stmt:2'
    };

    const { view, consent } = buildViewAndConsent({
      subject: 'did:wsd:123',
      schema,
      linkedStatements
    });

    expect(view.linked_statements).toEqual(linkedStatements);
    expect(consent.scope.schema_id).toBe('market:mm2:v1');
    expect(consent.scope.keys).toEqual(['email', 'city']);
  });
});
