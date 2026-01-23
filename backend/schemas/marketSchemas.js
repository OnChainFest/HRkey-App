export const MARKET_SCHEMAS = {
  'market:mm1:v1': {
    id: 'market:mm1:v1',
    title: 'Market MM1',
    purpose: 'Collect encrypted profile data for marketplace onboarding.',
    grantee: 'market:mm1',
    fields: [
      {
        key: 'email',
        label: 'Email',
        type: 'string',
        required: true,
        sensitivity: 'high',
        statement_type: 'ATTRIBUTE'
      },
      {
        key: 'city',
        label: 'City',
        type: 'string',
        required: true,
        sensitivity: 'medium',
        statement_type: 'ATTRIBUTE'
      },
      {
        key: 'distance_km',
        label: 'Preferred distance (km)',
        type: 'number',
        required: true,
        sensitivity: 'medium',
        statement_type: 'PREFERENCE'
      },
      {
        key: 'age_over',
        label: 'Age over 18',
        type: 'boolean',
        required: true,
        sensitivity: 'low',
        statement_type: 'PROOF',
        proof: {
          type: 'age_over',
          min_age: 18
        }
      }
    ]
  },
  'market:mm2:v1': {
    id: 'market:mm2:v1',
    title: 'Market MM2',
    purpose: 'Reuse encrypted wallet data for a second marketplace.',
    grantee: 'market:mm2',
    fields: [
      {
        key: 'email',
        label: 'Email',
        type: 'string',
        required: true,
        sensitivity: 'high',
        statement_type: 'ATTRIBUTE'
      },
      {
        key: 'city',
        label: 'City',
        type: 'string',
        required: true,
        sensitivity: 'medium',
        statement_type: 'ATTRIBUTE'
      },
      {
        key: 'distance_km',
        label: 'Preferred distance (km)',
        type: 'number',
        required: true,
        sensitivity: 'medium',
        statement_type: 'PREFERENCE'
      },
      {
        key: 'age_over',
        label: 'Age over 21',
        type: 'boolean',
        required: true,
        sensitivity: 'low',
        statement_type: 'PROOF',
        proof: {
          type: 'age_over',
          min_age: 21
        }
      }
    ]
  }
};

export const getMarketSchema = (schemaId) => MARKET_SCHEMAS[schemaId] ?? null;
