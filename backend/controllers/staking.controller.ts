/**
 * Staking Controller
 *
 * Handles HTTP endpoints for HRK token staking operations:
 * - Stake HRK tokens
 * - View staking positions
 * - Calculate rewards
 * - Claim rewards
 * - Unstake tokens
 */

import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import HRKStakingABI from '../../../abis/HRKStaking.json';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Initialize contract interface
const provider = new ethers.JsonRpcProvider(
  process.env.BASE_RPC_URL || 'https://mainnet.base.org'
);
const stakingContract = new ethers.Contract(
  process.env.STAKING_CONTRACT_ADDRESS!,
  HRKStakingABI.abi,
  provider
);

/**
 * POST /api/staking/stake
 * Create a new HRK staking position
 */
export async function createStake(req: Request, res: Response): Promise<void> {
  try {
    const { amount, lockPeriod, tier } = req.body;
    const userId = (req as any).user?.id;

    // Validation
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!amount || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0',
      });
      return;
    }

    if (!lockPeriod || lockPeriod < 1 || lockPeriod > 48) {
      res.status(400).json({
        success: false,
        error: 'Lock period must be between 1 and 48 months',
      });
      return;
    }

    const validTiers = ['Bronze', 'Silver', 'Gold', 'Platinum'];
    if (!tier || !validTiers.includes(tier)) {
      res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be: Bronze, Silver, Gold, or Platinum',
      });
      return;
    }

    // Get user's wallet address
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('wallet_address')
      .eq('id', userId)
      .single();

    if (userError || !user?.wallet_address) {
      res.status(404).json({
        success: false,
        error: 'User wallet not found',
      });
      return;
    }

    // Verify tier requirements on-chain
    const tierIndex = validTiers.indexOf(tier);
    const tierConfig = await stakingContract.getTierConfig(tierIndex);
    const minStake = tierConfig.minimumStake;

    const amountWei = ethers.parseEther(amount.toString());
    if (amountWei < minStake) {
      res.status(400).json({
        success: false,
        error: `Minimum stake for ${tier} tier is ${ethers.formatEther(minStake)} HRK`,
      });
      return;
    }

    // Calculate unlock date
    const unlockAt = new Date();
    unlockAt.setMonth(unlockAt.getMonth() + lockPeriod);

    // Calculate estimated rewards
    const multiplier = getRewardMultiplier(lockPeriod);
    const estimatedAPY = getEstimatedAPY(tier);
    const estimatedRewards = (amount * estimatedAPY * lockPeriod) / 12 / 100;

    // Create stake record in database
    const { data: stake, error: stakeError } = await supabase
      .from('hrk_stakes')
      .insert({
        user_id: userId,
        wallet_address: user.wallet_address,
        amount: amountWei.toString(),
        amount_hrk: amount,
        tier,
        lockup_months: lockPeriod,
        status: 'active',
        staked_at: new Date(),
        unlock_at: unlockAt,
      })
      .select()
      .single();

    if (stakeError) {
      throw stakeError;
    }

    res.status(201).json({
      success: true,
      data: {
        stakeId: stake.id,
        amount,
        tier,
        lockPeriod,
        unlockDate: unlockAt,
        estimatedAPY,
        estimatedRewards,
        rewardMultiplier: multiplier,
      },
    });
  } catch (error) {
    console.error('Create stake error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create stake',
    });
  }
}

/**
 * GET /api/staking/positions
 * Get user's staking positions
 */
export async function getStakingPositions(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Get user's stakes from database
    const { data: stakes, error } = await supabase
      .from('hrk_stakes')
      .select('*')
      .eq('user_id', userId)
      .order('staked_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Enrich with on-chain reward data
    const enrichedStakes = await Promise.all(
      (stakes || []).map(async (stake) => {
        if (stake.status === 'active') {
          try {
            // Get pending rewards from contract
            const stakingInfo = await stakingContract.getUserStakingInfo(
              stake.wallet_address
            );

            return {
              ...stake,
              pendingRewards: Number(ethers.formatUnits(stakingInfo.pendingRewards, 6)), // RLUSD has 6 decimals
              totalClaimed: Number(ethers.formatUnits(stakingInfo.totalClaimed, 6)),
            };
          } catch (err) {
            console.warn('Failed to fetch on-chain data for stake:', stake.id);
            return {
              ...stake,
              pendingRewards: 0,
              totalClaimed: stake.rewards_claimed_rlusd || 0,
            };
          }
        }
        return stake;
      })
    );

    res.status(200).json({
      success: true,
      data: enrichedStakes,
    });
  } catch (error) {
    console.error('Get staking positions error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get staking positions',
    });
  }
}

/**
 * POST /api/staking/claim-rewards
 * Claim accumulated staking rewards
 */
export async function claimRewards(req: Request, res: Response): Promise<void> {
  try {
    const { stakeId } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!stakeId) {
      res.status(400).json({
        success: false,
        error: 'Stake ID is required',
      });
      return;
    }

    // Verify stake ownership
    const { data: stake, error: stakeError } = await supabase
      .from('hrk_stakes')
      .select('*')
      .eq('id', stakeId)
      .eq('user_id', userId)
      .single();

    if (stakeError || !stake) {
      res.status(404).json({
        success: false,
        error: 'Stake not found',
      });
      return;
    }

    if (stake.status !== 'active') {
      res.status(400).json({
        success: false,
        error: 'Can only claim rewards from active stakes',
      });
      return;
    }

    // Get pending rewards from contract
    const rewards = await stakingContract.calculateRewards(stake.wallet_address);
    const rewardsRLUSD = Number(ethers.formatUnits(rewards, 6));

    if (rewardsRLUSD === 0) {
      res.status(400).json({
        success: false,
        error: 'No rewards to claim',
      });
      return;
    }

    // Note: Actual claiming would require user's wallet signature
    // This endpoint should return transaction data for the frontend to execute

    res.status(200).json({
      success: true,
      data: {
        pendingRewards: rewardsRLUSD,
        message: 'Ready to claim. Execute claimRewards() on staking contract.',
        contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
        functionName: 'claimRewards',
      },
    });
  } catch (error) {
    console.error('Claim rewards error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim rewards',
    });
  }
}

/**
 * POST /api/staking/unstake
 * Initiate unstaking process
 */
export async function initiateUnstake(req: Request, res: Response): Promise<void> {
  try {
    const { stakeId, emergency } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!stakeId) {
      res.status(400).json({
        success: false,
        error: 'Stake ID is required',
      });
      return;
    }

    // Verify stake ownership
    const { data: stake, error: stakeError } = await supabase
      .from('hrk_stakes')
      .select('*')
      .eq('id', stakeId)
      .eq('user_id', userId)
      .single();

    if (stakeError || !stake) {
      res.status(404).json({
        success: false,
        error: 'Stake not found',
      });
      return;
    }

    if (stake.status !== 'active') {
      res.status(400).json({
        success: false,
        error: 'Stake is not active',
      });
      return;
    }

    // Check if lockup period has ended
    const unlockDate = new Date(stake.unlock_at);
    const now = new Date();
    const isLocked = now < unlockDate;

    if (isLocked && !emergency) {
      res.status(400).json({
        success: false,
        error: `Stake is locked until ${unlockDate.toISOString()}. Use emergency unstake to withdraw early (50% penalty).`,
      });
      return;
    }

    if (emergency) {
      // Emergency unstake with 50% penalty
      const penalty = stake.amount_hrk * 0.5;
      const amountAfterPenalty = stake.amount_hrk - penalty;

      res.status(200).json({
        success: true,
        data: {
          type: 'emergency',
          amount: stake.amount_hrk,
          penalty,
          amountAfterPenalty,
          message: 'Emergency unstake will incur 50% penalty. Execute emergencyUnstake() on contract.',
          contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
          functionName: 'emergencyUnstake',
        },
      });
    } else {
      // Normal unstake with cooldown
      const tier = stake.tier;
      const cooldownPeriod = getCooldownPeriod(tier);
      const cooldownEnd = new Date();
      cooldownEnd.setDate(cooldownEnd.getDate() + cooldownPeriod);

      // Update stake status
      await supabase
        .from('hrk_stakes')
        .update({
          status: 'unstaking',
          unstake_requested_at: new Date(),
        })
        .eq('id', stakeId);

      res.status(200).json({
        success: true,
        data: {
          type: 'normal',
          amount: stake.amount_hrk,
          cooldownDays: cooldownPeriod,
          availableAt: cooldownEnd,
          message: `Cooldown initiated. Execute finalizeUnstake() after ${cooldownEnd.toISOString()}`,
          contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
          step1: 'initiateUnstake()',
          step2: `finalizeUnstake() after ${cooldownEnd.toISOString()}`,
        },
      });
    }
  } catch (error) {
    console.error('Initiate unstake error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initiate unstake',
    });
  }
}

/**
 * GET /api/staking/stats
 * Get staking statistics
 */
export async function getStakingStats(req: Request, res: Response): Promise<void> {
  try {
    // Get TVL from contract
    const tvl = await stakingContract.getTVL();
    const tvlHRK = Number(ethers.formatEther(tvl.tvlHRK));
    const tvlRewards = Number(ethers.formatUnits(tvl.tvlRewards, 6));

    // Get database stats
    const { data: dbStats } = await supabase
      .from('hrk_stakes')
      .select('tier, status, amount_hrk')
      .eq('status', 'active');

    const tierDistribution = (dbStats || []).reduce((acc: any, stake) => {
      acc[stake.tier] = (acc[stake.tier] || 0) + 1;
      return acc;
    }, {});

    const totalStakers = dbStats?.length || 0;
    const averageStake = totalStakers > 0 ? tvlHRK / totalStakers : 0;

    res.status(200).json({
      success: true,
      data: {
        totalValueLocked: {
          hrk: tvlHRK,
          rewardsPool: tvlRewards,
        },
        totalStakers,
        averageStake,
        tierDistribution,
      },
    });
  } catch (error) {
    console.error('Get staking stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get staking stats',
    });
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getRewardMultiplier(lockupMonths: number): number {
  if (lockupMonths >= 12) return 2.0;
  if (lockupMonths >= 6) return 1.5;
  if (lockupMonths >= 3) return 1.25;
  return 1.0;
}

function getEstimatedAPY(tier: string): number {
  const apyMap: Record<string, number> = {
    Bronze: 5,
    Silver: 8,
    Gold: 12,
    Platinum: 15,
  };
  return apyMap[tier] || 5;
}

function getCooldownPeriod(tier: string): number {
  const cooldownMap: Record<string, number> = {
    Bronze: 7,
    Silver: 14,
    Gold: 30,
    Platinum: 90,
  };
  return cooldownMap[tier] || 7;
}
