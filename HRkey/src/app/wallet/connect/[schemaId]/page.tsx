'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildViewAndConsent,
  encryptString,
  matchMarketSchemaFields,
  resolveFieldKey,
  SupabaseVaultIndex
} from '@/lib/sdl';
import type { FieldMatchResult, MarketSchema } from '@/lib/sdl/types';

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  '';

const normalizeBase = (url: string) => url.replace(/\/$/, '');

const getApiBase = () => {
  if (ENV_API_BASE) return normalizeBase(ENV_API_BASE);
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
  return 'http://localhost:3001';
};

type FieldFormState = {
  useExisting: boolean;
  value: string;
  selfAttest: boolean;
};

const DID_STORAGE_KEY = 'wsd_subject_did_v1';

const getOrCreateDid = () => {
  if (typeof window === 'undefined') return null;
  const existing = window.localStorage.getItem(DID_STORAGE_KEY);
  if (existing) return existing;
  const next = `did:wsd:${crypto.randomUUID()}`;
  window.localStorage.setItem(DID_STORAGE_KEY, next);
  return next;
};

export default function WalletConnectPage() {
  const params = useParams<{ schemaId: string }>();
  const schemaId = params?.schemaId;
  const [schema, setSchema] = useState<MarketSchema | null>(null);
  const [decisions, setDecisions] = useState<FieldMatchResult[]>([]);
  const [fieldState, setFieldState] = useState<Record<string, FieldFormState>>({});
  const [subjectDid, setSubjectDid] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState<string>('');

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    const did = getOrCreateDid();
    setSubjectDid(did);
  }, []);

  useEffect(() => {
    const loadSchema = async () => {
      if (!schemaId) return;
      setStatus('loading');
      setMessage('Loading schema...');
      try {
        const response = await fetch(`${apiBase}/api/market-schemas/${schemaId}`);
        if (!response.ok) {
          throw new Error('Schema not available');
        }
        const data = (await response.json()) as MarketSchema;
        setSchema(data);
        setStatus('idle');
        setMessage('');
      } catch (error) {
        setStatus('error');
        setMessage('Unable to load market schema.');
      }
    };

    loadSchema();
  }, [apiBase, schemaId]);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setStatus('error');
        setMessage('Please sign in before connecting your wallet.');
        return;
      }
      setSubjectId(data.user.id);
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadMatches = async () => {
      if (!schema || !subjectId) return;
      try {
        const vaultIndex = new SupabaseVaultIndex({ subject: subjectId, supabase: supabase as SupabaseClient });
        const results = await matchMarketSchemaFields(schema, vaultIndex);
        setDecisions(results);
        const nextState: Record<string, FieldFormState> = {};
        results.forEach(result => {
          const key = result.field.key;
          nextState[key] = {
            useExisting: result.decision === 'REUSE_OK',
            value: '',
            selfAttest: false
          };
        });
        setFieldState(nextState);
      } catch (error) {
        setStatus('error');
        setMessage('Failed to load wallet statements.');
      }
    };

    loadMatches();
  }, [schema, subjectId]);

  const updateField = (key: string, updates: Partial<FieldFormState>) => {
    setFieldState(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates }
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!schema || !subjectDid || !subjectId) return;

    setStatus('loading');
    setMessage('Encrypting and saving statements...');

    try {
      const linkedStatements: Record<string, string> = {};
      const statementsToInsert: Array<Record<string, unknown>> = [];
      const now = new Date().toISOString();

      for (const result of decisions) {
        const field = result.field;
        const state = fieldState[field.key];

        if (field.proof) {
          const proofKey = `proof:${field.proof.type}`;
          if (state?.useExisting && result.statement?.id) {
            linkedStatements[proofKey] = result.statement.id;
            continue;
          }
          if (!state?.selfAttest) {
            setStatus('error');
            setMessage(`Proof required: ${field.label}.`);
            return;
          }

          statementsToInsert.push({
            id: `sdl:stmt:${crypto.randomUUID()}`,
            subject: subjectId,
            key: proofKey,
            type: 'PROOF',
            sensitivity: field.sensitivity ?? 'low',
            value_ref: { type: 'proof', key_ref: 'self' },
            proof: {
              type: field.proof.type,
              params: { min_age: field.proof.min_age },
              issuer: 'self',
              issued_at: now
            },
            provenance: {
              schema_id: schema.id,
              source: 'market_form',
              subject_did: subjectDid
            },
            updated_at: now
          });
          continue;
        }

        const canonicalKey = resolveFieldKey(field.key) ?? field.key;
        if (state?.useExisting && result.statement?.id) {
          linkedStatements[canonicalKey] = result.statement.id;
          continue;
        }

        if (!state?.value) {
          if (field.required ?? true) {
            setStatus('error');
            setMessage(`Please provide ${field.label}.`);
            return;
          }
          continue;
        }

        const valueRef = await encryptString(state.value);
        statementsToInsert.push({
          id: `sdl:stmt:${crypto.randomUUID()}`,
          subject: subjectId,
          key: canonicalKey,
          type: field.statement_type ?? 'ATTRIBUTE',
          sensitivity: field.sensitivity ?? 'medium',
          value_ref: valueRef,
          provenance: {
            schema_id: schema.id,
            source: 'market_form',
            subject_did: subjectDid
          },
          updated_at: now
        });
      }

      if (statementsToInsert.length > 0) {
        const { data, error } = await supabase
          .from('sdl_statements')
          .insert(statementsToInsert)
          .select('id, key');

        if (error) {
          throw new Error('Failed to store encrypted statements');
        }

        data?.forEach(row => {
          linkedStatements[row.key] = row.id;
        });
      }

      const { view, consent } = buildViewAndConsent({
        subject: subjectDid,
        schema,
        linkedStatements
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error('Authentication required');
      }

      const consentResponse = await fetch(`${apiBase}/api/wallet/consents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(consent)
      });

      if (!consentResponse.ok) {
        throw new Error('Consent recording failed');
      }

      const viewResponse = await fetch(`${apiBase}/api/wallet/views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ view, consent_id: consent.consent_id })
      });

      if (!viewResponse.ok) {
        throw new Error('View issuance failed');
      }

      setStatus('success');
      setMessage('Wallet connected. Consent and view issued.');
    } catch (error) {
      setStatus('error');
      setMessage('Failed to submit wallet data. Please retry.');
    }
  };

  const showNextLink = status === 'success' && schemaId === 'market:mm1:v1';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Wallet Soberana de Derechos</h1>
        <p className="text-sm text-gray-600">
          Conecta tu wallet de datos y reutiliza información cifrada entre mercados.
        </p>
      </header>

      {schema ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-semibold">{schema.title}</h2>
            <p className="text-sm text-gray-500">{schema.purpose}</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {decisions.map(result => {
              const field = result.field;
              const state = fieldState[field.key];
              const showValueInput = !state?.useExisting || result.decision !== 'REUSE_OK';
              const highlightUpdate = result.decision === 'REUSE_NEEDS_UPDATE';
              const isProof = !!field.proof;

              return (
                <div
                  key={field.key}
                  className={`rounded-lg border px-4 py-3 ${
                    highlightUpdate ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{field.label}</p>
                      <p className="text-xs text-gray-500">Decision: {result.decision}</p>
                    </div>
                    {!isProof && result.statement && (
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!!state?.useExisting}
                          onChange={event =>
                            updateField(field.key, { useExisting: event.target.checked })
                          }
                        />
                        Use existing ✅
                      </label>
                    )}
                    {isProof && result.statement && (
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!!state?.useExisting}
                          onChange={event =>
                            updateField(field.key, { useExisting: event.target.checked })
                          }
                        />
                        Use existing proof ✅
                      </label>
                    )}
                  </div>

                  {isProof ? (
                    <div className="mt-3 text-sm text-gray-600">
                      <p>
                        Proof requirement: age over {field.proof?.min_age ?? 'N/A'}. Self-attest
                        if needed.
                      </p>
                      <label className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!state?.selfAttest}
                          onChange={event =>
                            updateField(field.key, { selfAttest: event.target.checked })
                          }
                        />
                        Self-attest (issuer: self)
                      </label>
                    </div>
                  ) : (
                    <div className="mt-3">
                      {showValueInput ? (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={state?.value ?? ''}
                          onChange={event => updateField(field.key, { value: event.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      ) : (
                        <p className="text-xs text-gray-500">Using existing encrypted value.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="submit"
              className="w-full rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Submitting...' : 'Submit & Share'}
            </button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-gray-600">Loading schema...</p>
      )}

      {message && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : status === 'success'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          {message}
        </div>
      )}

      {showNextLink && (
        <a
          href="/wallet/connect/market:mm2:v1"
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Go to MM2 ➜
        </a>
      )}
    </div>
  );
}
