/**
 * HRKey Dynamic Pricing Engine
 * Calculates market-driven prices for candidate references
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Constants - USDC pricing (stablecoin denominated)
// HRK is NOT used for pricing - it's a utility token only
export const P_BASE = 25;  // USDC base price
export const P_MIN = 10;   // USDC minimum
export const P_MAX = 1000; // USDC maximum

// Interfaces
export interface PricingFactors {
  yearsOfExperience: number;
  queriesLast30Days: number;
  skillPercentile: number;      // 0.0 - 1.0
  hrScore: number;               // 0 - 100
  location: string;
  industry: string;
}

export interface PricingResult {
  priceUSDC: number; // All marketplace pricing in USDC (NOT HRK)
  factors: {
    seniority: number;
    demand: number;
    rarity: number;
    hrScore: number;
    geography: number;
    industry: number;
  };
  breakdown: string;
  metadata: {
    calculatedAt: Date;
    validUntil: Date;
  };
}

/**
 * Calculate seniority multiplier based on years of experience
 * Formula: M = 1 + (years / 20), capped at 2.0x
 */
export function getSeniorityMultiplier(yearsOfExperience: number): number {
  const years = Math.max(0, yearsOfExperience);
  const cappedYears = Math.min(years, 20);
  return 1 + (cappedYears / 20);
}

/**
 * Calculate demand multiplier based on query volume
 * Formula: M = 1 + log10(1 + queries / avgQueries)
 */
export function getDemandMultiplier(
  queriesLast30Days: number,
  globalAvgQueries: number
): number {
  const queries = Math.max(0, queriesLast30Days);
  const avgQueries = Math.max(1, globalAvgQueries);

  const ratio = queries / avgQueries;
  const multiplier = 1 + Math.log10(1 + ratio);

  // Cap at 3.0x (prevents extreme pricing)
  return Math.min(multiplier, 3.0);
}

/**
 * Calculate rarity multiplier based on skill percentile
 * Formula: M = 1 + (1 - percentile)
 */
export function getRarityMultiplier(skillPercentile: number): number {
  const percentile = Math.max(0, Math.min(1, skillPercentile));
  return 1 + (1 - percentile);
}

/**
 * Calculate HRScore multiplier
 * Formula: M = 0.5 + (score / 100)
 */
export function getHRScoreMultiplier(hrScore: number): number {
  const score = Math.max(0, Math.min(100, hrScore));
  return 0.5 + (score / 100);
}

/**
 * Market compensation index by country
 */
const MARKET_COMPENSATION_INDEX: Record<string, number> = {
  // Tier 1 (High cost markets)
  'Switzerland': 120,
  'Singapore': 115,
  'Norway': 118,
  'Denmark': 115,
  'Luxembourg': 117,

  // Tier 2 (Above average)
  'United States': 100,
  'United Kingdom': 95,
  'Germany': 92,
  'Australia': 98,
  'Canada': 90,
  'Netherlands': 93,
  'Sweden': 94,
  'France': 88,

  // Tier 3 (Average)
  'Spain': 75,
  'Italy': 72,
  'South Korea': 85,
  'Japan': 82,
  'Israel': 80,
  'UAE': 85,

  // Tier 4 (Below average)
  'Mexico': 60,
  'Brazil': 55,
  'Poland': 68,
  'Argentina': 58,
  'Chile': 62,
  'Portugal': 65,
  'Greece': 63,

  // Tier 5 (Low cost markets)
  'India': 40,
  'Vietnam': 35,
  'Philippines': 38,
  'Indonesia': 36,
  'Thailand': 42,
  'Malaysia': 45,
  'China': 50,

  // Tier 6 (Very low cost)
  'Pakistan': 28,
  'Bangladesh': 25,
  'Nigeria': 30,
  'Egypt': 32,
  'Ukraine': 35,
};

/**
 * Calculate geography multiplier based on location
 */
export function getGeographyMultiplier(location: string): number {
  const index = MARKET_COMPENSATION_INDEX[location] || 100; // Default to Tier 2
  return index / 100;
}

/**
 * Industry turnover rates (annual %)
 */
const INDUSTRY_TURNOVER_RATES: Record<string, number> = {
  'Hospitality': 73,
  'Retail': 60,
  'Call Center': 50,
  'Real Estate': 35,
  'Construction': 28,
  'Technology': 25,
  'Manufacturing': 22,
  'Finance': 20,
  'Healthcare': 18,
  'Nonprofit': 15,
  'Academia': 12,
  'Government': 8,
};

/**
 * Calculate industry multiplier based on turnover rate
 */
export function getIndustryMultiplier(industry: string): number {
  const turnoverRate = INDUSTRY_TURNOVER_RATES[industry] || 20; // Default 20%
  return 1 + (turnoverRate / 100);
}

/**
 * Main pricing calculation function
 */
export async function calculateCandidatePrice(
  candidateWallet: string
): Promise<PricingResult> {
  try {
    // 1. Fetch candidate data from Supabase
    const { data: candidate, error: candidateError } = await supabase
      .from('users')
      .select(`
        years_of_experience,
        location,
        industry,
        hr_score
      `)
      .eq('wallet_address', candidateWallet)
      .single();

    if (candidateError || !candidate) {
      throw new Error(`Candidate not found: ${candidateWallet}`);
    }

    // 2. Fetch skill rarity (simplified: using primary skill)
    const { data: skills, error: skillsError } = await supabase
      .from('candidate_skills')
      .select('skill_percentile')
      .eq('candidate_wallet', candidateWallet)
      .limit(1)
      .single();

    const skillPercentile = skills?.skill_percentile || 0.5; // Default to median

    // 3. Fetch query count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: queriesLast30Days } = await supabase
      .from('queries')
      .select('*', { count: 'exact', head: true })
      .eq('candidate_wallet', candidateWallet)
      .gte('created_at', thirtyDaysAgo.toISOString());

    // 4. Fetch global average queries
    const { data: avgData } = await supabase
      .rpc('get_average_queries_per_candidate_30d');

    const globalAvgQueries = avgData?.[0]?.avg || 5; // Default to 5 if no data

    // 5. Calculate all multipliers
    const factors = {
      seniority: getSeniorityMultiplier(candidate.years_of_experience || 0),
      demand: getDemandMultiplier(queriesLast30Days || 0, globalAvgQueries),
      rarity: getRarityMultiplier(skillPercentile),
      hrScore: getHRScoreMultiplier(candidate.hr_score || 50),
      geography: getGeographyMultiplier(candidate.location || 'United States'),
      industry: getIndustryMultiplier(candidate.industry || 'Technology'),
    };

    // 6. Apply pricing formula
    const rawPrice = P_BASE *
      factors.seniority *
      factors.demand *
      factors.rarity *
      factors.hrScore *
      factors.geography *
      factors.industry;

    // 7. Apply bounds
    const finalPrice = Math.min(Math.max(rawPrice, P_MIN), P_MAX);

    // 8. Generate breakdown (USDC pricing)
    const breakdown = `
Base Price: $${P_BASE} USDC
× Seniority (${candidate.years_of_experience || 0} years): ${factors.seniority.toFixed(2)}x
× Demand (${queriesLast30Days || 0} queries, avg ${globalAvgQueries.toFixed(0)}): ${factors.demand.toFixed(2)}x
× Skill Rarity (percentile ${(skillPercentile * 100).toFixed(0)}): ${factors.rarity.toFixed(2)}x
× HRScore (${candidate.hr_score || 50}): ${factors.hrScore.toFixed(2)}x
× Geography (${candidate.location || 'United States'}): ${factors.geography.toFixed(2)}x
× Industry (${candidate.industry || 'Technology'}): ${factors.industry.toFixed(2)}x
= $${finalPrice.toFixed(2)} USDC
    `.trim();

    // 9. Return result
    const now = new Date();
    const validUntil = new Date(now.getTime() + 6 * 60 * 60 * 1000); // Valid for 6 hours

    return {
      priceUSDC: Number(finalPrice.toFixed(2)), // USDC pricing, NOT HRK
      factors,
      breakdown,
      metadata: {
        calculatedAt: now,
        validUntil,
      },
    };
  } catch (error: any) {
    console.error('Error calculating price:', error);
    throw new Error(`Price calculation failed: ${error.message}`);
  }
}

/**
 * Calculate prices for all candidates (for Merkle tree generation)
 */
export async function calculateAllPrices(): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  try {
    // Fetch all candidates
    const { data: candidates, error } = await supabase
      .from('users')
      .select('wallet_address')
      .not('wallet_address', 'is', null);

    if (error || !candidates) {
      throw new Error('Failed to fetch candidates');
    }

    console.log(`Calculating prices for ${candidates.length} candidates...`);

    // Calculate price for each candidate
    for (const candidate of candidates) {
      try {
        const result = await calculateCandidatePrice(candidate.wallet_address);
        prices.set(candidate.wallet_address, result.priceUSDC);
      } catch (error: any) {
        console.warn(`Failed to calculate price for ${candidate.wallet_address}:`, error.message);
        // Fallback to base price
        prices.set(candidate.wallet_address, P_BASE);
      }
    }

    console.log(`Successfully calculated ${prices.size} prices`);
    return prices;
  } catch (error: any) {
    console.error('Error in calculateAllPrices:', error);
    throw error;
  }
}

/**
 * Store calculated prices in database
 */
export async function storePricesInDB(prices: Map<string, number>): Promise<void> {
  try {
    const records = Array.from(prices.entries()).map(([wallet, price]) => ({
      candidate_wallet: wallet,
      price_usdc: price, // Store USDC price, NOT HRK
      updated_at: new Date().toISOString(),
    }));

    // Batch upsert (Supabase automatically handles conflicts)
    const { error } = await supabase
      .from('candidate_prices')
      .upsert(records, { onConflict: 'candidate_wallet' });

    if (error) {
      throw error;
    }

    console.log(`Stored ${records.length} prices in database`);
  } catch (error: any) {
    console.error('Error storing prices:', error);
    throw new Error(`Failed to store prices: ${error.message}`);
  }
}

/**
 * Get cached price from database
 */
export async function getCachedPrice(candidateWallet: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('candidate_prices')
      .select('price_usdc, updated_at')
      .eq('candidate_wallet', candidateWallet)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if price is stale (>6 hours old)
    const updatedAt = new Date(data.updated_at);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceUpdate > 6) {
      return null; // Stale price
    }

    return data.price_usdc; // Return USDC price
  } catch (error: any) {
    console.error('Error fetching cached price:', error);
    return null;
  }
}

/**
 * Get price with caching fallback
 */
export async function getPrice(candidateWallet: string): Promise<number> {
  // Try cache first
  const cachedPrice = await getCachedPrice(candidateWallet);
  if (cachedPrice !== null) {
    return cachedPrice;
  }

  // Calculate fresh price
  const result = await calculateCandidatePrice(candidateWallet);

  // Store in cache
  await storePricesInDB(new Map([[candidateWallet, result.priceUSDC]]));

  return result.priceUSDC;
}
