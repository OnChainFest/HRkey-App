import type { SupabaseClient } from '@supabase/supabase-js';
import type { SDLStatement } from './types';

export class SupabaseVaultIndex {
  private subject: string;
  private supabase: SupabaseClient;

  constructor(params: { subject: string; supabase: SupabaseClient }) {
    this.subject = params.subject;
    this.supabase = params.supabase;
  }

  async getLatest(key: string): Promise<SDLStatement | null> {
    const { data, error } = await this.supabase
      .from('sdl_statements')
      .select('*')
      .eq('subject', this.subject)
      .eq('key', key)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error('Failed to load vault statements');
    }

    return data?.[0] ?? null;
  }
}
