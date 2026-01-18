// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBurnableToken {
    function burn(uint256 amount) external;
}

/**
 * @title HRKStaking
 * @notice Staking contract for HRKey evaluators and employers
 * @dev Implements:
 *      - 4-tier bonded staking system (Bronze, Silver, Gold, Platinum)
 *      - Cooldown periods per tier
 *      - Emergency unstake with penalty
 */
contract HRKStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    // HRK token
    IERC20 public HRK;

    // Staking tiers
    enum Tier {
        Bronze,   // 0
        Silver,   // 1
        Gold,     // 2
        Platinum  // 3
    }

    // Stake information
    struct Stake {
        uint256 amount;                 // Amount staked
        Tier tier;                      // Staking tier
        uint256 stakedAt;               // Timestamp when staked
        uint256 lockupMonths;           // Lockup period in months
        uint256 unstakeRequestedAt;     // Timestamp when unstake requested (0 if not requested)
    }

    // Tier configuration
    struct TierConfig {
        uint256 minimumStake;           // Minimum HRK to stake
        uint256 maxEvaluationsPerMonth; // 0 = unlimited
        uint256 cooldownPeriod;         // Cooldown period in seconds
    }

    // Mappings
    mapping(address => Stake) public stakes;
    mapping(Tier => TierConfig) public tierConfigs;

    // Global state
    uint256 public totalStaked;
    uint256 public totalRewardsDistributed;
    uint256 public rewardPoolBalance;              // RLUSD balance for rewards
    address public rewardToken;                     // RLUSD token address

    // Reward tracking per user
    mapping(address => uint256) public userRewardsClaimed;
    mapping(address => uint256) public userRewardsEarned;

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant EMERGENCY_UNSTAKE_PENALTY_BPS = 5000; // 50%

    // Events
    event Staked(address indexed user, uint256 amount, Tier tier, uint256 lockupMonths);
    event UnstakeRequested(address indexed user, uint256 unlockTime);
    event Unstaked(address indexed user, uint256 amount);
    event EmergencyUnstaked(address indexed user, uint256 amount, uint256 penalty);
    event TierConfigUpdated(Tier tier, uint256 minimumStake, uint256 maxEvaluationsPerMonth, uint256 cooldown);
    event RewardsDeposited(uint256 amount, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardsDistributed(uint256 totalAmount, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the staking contract
     * @param _hrkToken Address of the HRK token
     * @param _rewardToken Address of the reward token (RLUSD)
     * @param _admin Address of the admin
     */
    function initialize(address _hrkToken, address _rewardToken, address _admin) public initializer {
        require(_hrkToken != address(0), "Invalid HRK token");
        require(_rewardToken != address(0), "Invalid reward token");
        require(_admin != address(0), "Invalid admin");

        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        HRK = IERC20(_hrkToken);
        rewardToken = _rewardToken;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
        _grantRole(SLASHER_ROLE, _admin);
        // Initialize tier configurations
        tierConfigs[Tier.Bronze] = TierConfig({
            minimumStake: 100 * 10**18,
            maxEvaluationsPerMonth: 20,
            cooldownPeriod: 7 days
        });

        tierConfigs[Tier.Silver] = TierConfig({
            minimumStake: 500 * 10**18,
            maxEvaluationsPerMonth: 100,
            cooldownPeriod: 14 days
        });

        tierConfigs[Tier.Gold] = TierConfig({
            minimumStake: 2000 * 10**18,
            maxEvaluationsPerMonth: 0, // unlimited
            cooldownPeriod: 30 days
        });

        tierConfigs[Tier.Platinum] = TierConfig({
            minimumStake: 10000 * 10**18,
            maxEvaluationsPerMonth: 0, // unlimited
            cooldownPeriod: 90 days
        });
    }

    /**
     * @notice Stake HRK tokens
     * @param amount Amount of HRK to stake
     * @param tier Desired staking tier
     * @param lockupMonths Lockup period (1-48 months)
     */
    function stake(
        uint256 amount,
        Tier tier,
        uint256 lockupMonths
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(lockupMonths >= 1 && lockupMonths <= 48, "Invalid lockup period");
        require(stakes[msg.sender].amount == 0, "Already staked, unstake first");

        TierConfig memory config = tierConfigs[tier];
        require(amount >= config.minimumStake, "Amount below tier minimum");

        // Transfer tokens from user
        HRK.safeTransferFrom(msg.sender, address(this), amount);

        // Create stake
        stakes[msg.sender] = Stake({
            amount: amount,
            tier: tier,
            stakedAt: block.timestamp,
            lockupMonths: lockupMonths,
            unstakeRequestedAt: 0
        });

        totalStaked += amount;

        emit Staked(msg.sender, amount, tier, lockupMonths);
    }

    /**
     * @notice Request to unstake tokens (starts cooldown)
     */
    function initiateUnstake() external {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No active stake");
        require(userStake.unstakeRequestedAt == 0, "Unstake already requested");

        // Check lockup period
        uint256 lockupEnd = userStake.stakedAt + (userStake.lockupMonths * 30 days);
        require(block.timestamp >= lockupEnd, "Lockup period not ended");

        userStake.unstakeRequestedAt = block.timestamp;

        TierConfig memory config = tierConfigs[userStake.tier];
        uint256 unlockTime = block.timestamp + config.cooldownPeriod;

        emit UnstakeRequested(msg.sender, unlockTime);
    }

    /**
     * @notice Execute unstake after cooldown period
     */
    function finalizeUnstake() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No active stake");
        require(userStake.unstakeRequestedAt > 0, "Unstake not requested");

        TierConfig memory config = tierConfigs[userStake.tier];
        uint256 cooldownEnd = userStake.unstakeRequestedAt + config.cooldownPeriod;
        require(block.timestamp >= cooldownEnd, "Cooldown period active");

        uint256 amount = userStake.amount;
        totalStaked -= amount;

        // Delete stake
        delete stakes[msg.sender];

        // Transfer stake
        HRK.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Emergency unstake with 50% penalty
     * @dev Allows immediate withdrawal with significant penalty
     */
    function emergencyUnstake() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No active stake");

        uint256 amount = userStake.amount;
        uint256 penalty = (amount * EMERGENCY_UNSTAKE_PENALTY_BPS) / BASIS_POINTS;
        uint256 amountAfterPenalty = amount - penalty;

        totalStaked -= amount;

        // Delete stake
        delete stakes[msg.sender];

        // Transfer reduced amount, burn penalty
        HRK.safeTransfer(msg.sender, amountAfterPenalty);
        IBurnableToken(address(HRK)).burn(penalty);

        emit EmergencyUnstaked(msg.sender, amountAfterPenalty, penalty);
    }

    /**
     * @notice Slash a staker's bonded amount (called by slashing contract)
     * @param evaluator Address of the evaluator to slash
     * @param amount Amount to slash
     */
    function slash(address evaluator, uint256 amount) external onlyRole(SLASHER_ROLE) {
        require(amount > 0, "Amount must be > 0");

        Stake storage userStake = stakes[evaluator];
        require(userStake.amount >= amount, "Insufficient stake");

        userStake.amount -= amount;
        totalStaked -= amount;

        if (userStake.amount == 0) {
            delete stakes[evaluator];
        }

        HRK.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Update tier configuration
     * @param tier Tier to update
     * @param minimumStake New minimum stake
     * @param maxEvaluationsPerMonth New max evaluations per month (0 = unlimited)
     * @param cooldownPeriod New cooldown period in seconds
     */
    function updateTierConfig(
        Tier tier,
        uint256 minimumStake,
        uint256 maxEvaluationsPerMonth,
        uint256 cooldownPeriod
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(cooldownPeriod <= 180 days, "Cooldown too long");

        tierConfigs[tier].minimumStake = minimumStake;
        tierConfigs[tier].maxEvaluationsPerMonth = maxEvaluationsPerMonth;
        tierConfigs[tier].cooldownPeriod = cooldownPeriod;

        emit TierConfigUpdated(tier, minimumStake, maxEvaluationsPerMonth, cooldownPeriod);
    }

    /**
     * @notice Pause staking operations
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause staking operations
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Authorize contract upgrades
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Get stake information for a user
     * @param staker Address of the staker
     * @return Stake struct
     */
    function getStake(address staker) external view returns (Stake memory) {
        return stakes[staker];
    }

    /**
     * @notice Get tier configuration
     * @param tier Tier to query
     * @return TierConfig struct
     */
    function getTierConfig(Tier tier) external view returns (TierConfig memory) {
        return tierConfigs[tier];
    }

    /**
     * @notice Deposit RLUSD rewards into pool (called by PaymentSplitter)
     * @dev 5% of all payments flow here as staking rewards
     * @param amount Amount of RLUSD to add to reward pool
     */
    function depositRewards(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(totalStaked > 0, "No active stakes");

        // Transfer RLUSD from sender to this contract
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);

        rewardPoolBalance += amount;
        totalRewardsDistributed += amount;

        emit RewardsDeposited(amount, block.timestamp);
        emit RewardsDistributed(amount, block.timestamp);
    }

    /**
     * @notice Calculate pending rewards for a user
     * @param user Address of the staker
     * @return rewards Amount of RLUSD rewards earned
     */
    function calculateRewards(address user) public view returns (uint256 rewards) {
        Stake memory userStake = stakes[user];
        if (userStake.amount == 0 || totalStaked == 0) {
            return 0;
        }

        // Get lock period multiplier
        uint256 multiplier = getLockPeriodMultiplier(userStake.lockupMonths);

        // Calculate weighted stake
        uint256 weightedStake = (userStake.amount * multiplier) / 100;

        // Calculate share of reward pool
        // Formula: (weightedStake / totalWeightedStakes) * rewardPoolBalance
        // Simplified for gas efficiency
        uint256 userShare = (weightedStake * rewardPoolBalance) / totalStaked;

        // Subtract already claimed rewards
        uint256 totalEarned = userRewardsEarned[user] + userShare;
        uint256 pending = totalEarned - userRewardsClaimed[user];

        return pending;
    }

    /**
     * @notice Claim accumulated rewards
     */
    function claimRewards() external nonReentrant whenNotPaused {
        require(stakes[msg.sender].amount > 0, "No active stake");

        uint256 rewards = calculateRewards(msg.sender);
        require(rewards > 0, "No rewards to claim");
        require(rewardPoolBalance >= rewards, "Insufficient reward pool");

        // Update state
        userRewardsClaimed[msg.sender] += rewards;
        rewardPoolBalance -= rewards;

        // Transfer RLUSD rewards
        IERC20(rewardToken).safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, rewards);
    }

    /**
     * @notice Get lock period multiplier for rewards
     * @param lockupMonths Lockup period in months
     * @return multiplier Multiplier in basis points (100 = 1.0x, 150 = 1.5x, 200 = 2.0x)
     */
    function getLockPeriodMultiplier(uint256 lockupMonths) public pure returns (uint256 multiplier) {
        if (lockupMonths >= 12) {
            return 200; // 2.0x for 12+ months
        } else if (lockupMonths >= 6) {
            return 150; // 1.5x for 6-11 months
        } else if (lockupMonths >= 3) {
            return 125; // 1.25x for 3-5 months
        } else {
            return 100; // 1.0x for 1-2 months
        }
    }

    /**
     * @notice Get user staking info including rewards
     * @param user Address to query
     * @return stakeAmount Amount staked
     * @return tier Staking tier
     * @return lockupMonths Lockup period
     * @return pendingRewards Unclaimed rewards
     * @return totalClaimed Total rewards claimed
     */
    function getUserStakingInfo(address user) external view returns (
        uint256 stakeAmount,
        Tier tier,
        uint256 lockupMonths,
        uint256 pendingRewards,
        uint256 totalClaimed
    ) {
        Stake memory userStake = stakes[user];
        return (
            userStake.amount,
            userStake.tier,
            userStake.lockupMonths,
            calculateRewards(user),
            userRewardsClaimed[user]
        );
    }

    /**
     * @notice Get total value locked (TVL)
     * @return tvlHRK Total HRK staked
     * @return tvlRewards Total RLUSD in reward pool
     */
    function getTVL() external view returns (
        uint256 tvlHRK,
        uint256 tvlRewards
    ) {
        return (totalStaked, rewardPoolBalance);
    }

    /**
     * @notice Get contract version
     */
    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}

