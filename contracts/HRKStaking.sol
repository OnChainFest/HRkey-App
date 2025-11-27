// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HRKStaking
 * @notice Staking contract for HRKey evaluators and employers
 * @dev Implements:
 *      - 4-tier staking system (Bronze, Silver, Gold, Platinum)
 *      - Dynamic APY with multipliers (quality, volume, lockup)
 *      - Cooldown periods per tier
 *      - Reward distribution
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
    bytes32 public constant REWARD_MANAGER_ROLE = keccak256("REWARD_MANAGER_ROLE");

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
        uint256 rewardsDebt;            // Rewards already claimed
        uint256 evaluationCount;        // Number of evaluations completed
        uint256 avgCorrelation;         // Average HRScore correlation (0-10000, 10000 = 1.0)
    }

    // Tier configuration
    struct TierConfig {
        uint256 minimumStake;           // Minimum HRK to stake
        uint256 maxEvaluationsPerMonth; // 0 = unlimited
        uint256 baseAPYBps;             // Base APY in basis points (500 = 5%)
        uint256 cooldownPeriod;         // Cooldown period in seconds
    }

    // Mappings
    mapping(address => Stake) public stakes;
    mapping(Tier => TierConfig) public tierConfigs;

    // Global state
    uint256 public totalStaked;
    uint256 public rewardsPool;
    uint256 public lastRewardDistribution;

    // Constants
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant EMERGENCY_UNSTAKE_PENALTY_BPS = 5000; // 50%

    // Events
    event Staked(address indexed user, uint256 amount, Tier tier, uint256 lockupMonths);
    event UnstakeRequested(address indexed user, uint256 unlockTime);
    event Unstaked(address indexed user, uint256 amount, uint256 rewards);
    event EmergencyUnstaked(address indexed user, uint256 amount, uint256 penalty);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardsDistributed(uint256 amount, uint256 timestamp);
    event EvaluationCompleted(address indexed evaluator, uint256 newCount, uint256 correlation);
    event TierConfigUpdated(Tier tier, uint256 minimumStake, uint256 baseAPYBps, uint256 cooldown);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the staking contract
     * @param _hrkToken Address of the HRK token
     * @param _admin Address of the admin
     */
    function initialize(address _hrkToken, address _admin) public initializer {
        require(_hrkToken != address(0), "Invalid HRK token");
        require(_admin != address(0), "Invalid admin");

        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        HRK = IERC20(_hrkToken);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
        _grantRole(REWARD_MANAGER_ROLE, _admin);

        // Initialize tier configurations
        tierConfigs[Tier.Bronze] = TierConfig({
            minimumStake: 100 * 10**18,
            maxEvaluationsPerMonth: 20,
            baseAPYBps: 500,  // 5%
            cooldownPeriod: 7 days
        });

        tierConfigs[Tier.Silver] = TierConfig({
            minimumStake: 500 * 10**18,
            maxEvaluationsPerMonth: 100,
            baseAPYBps: 800,  // 8%
            cooldownPeriod: 14 days
        });

        tierConfigs[Tier.Gold] = TierConfig({
            minimumStake: 2000 * 10**18,
            maxEvaluationsPerMonth: 0, // unlimited
            baseAPYBps: 1200, // 12%
            cooldownPeriod: 30 days
        });

        tierConfigs[Tier.Platinum] = TierConfig({
            minimumStake: 10000 * 10**18,
            maxEvaluationsPerMonth: 0, // unlimited
            baseAPYBps: 1500, // 15%
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
            unstakeRequestedAt: 0,
            rewardsDebt: 0,
            evaluationCount: 0,
            avgCorrelation: 5000 // Default 0.50 correlation
        });

        totalStaked += amount;

        emit Staked(msg.sender, amount, tier, lockupMonths);
    }

    /**
     * @notice Request to unstake tokens (starts cooldown)
     */
    function requestUnstake() external {
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
    function executeUnstake() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No active stake");
        require(userStake.unstakeRequestedAt > 0, "Unstake not requested");

        TierConfig memory config = tierConfigs[userStake.tier];
        uint256 cooldownEnd = userStake.unstakeRequestedAt + config.cooldownPeriod;
        require(block.timestamp >= cooldownEnd, "Cooldown period active");

        // Calculate pending rewards
        uint256 rewards = calculatePendingRewards(msg.sender);

        uint256 amount = userStake.amount;
        totalStaked -= amount;

        // Delete stake
        delete stakes[msg.sender];

        // Transfer stake + rewards
        HRK.safeTransfer(msg.sender, amount);
        if (rewards > 0 && rewards <= rewardsPool) {
            HRK.safeTransfer(msg.sender, rewards);
            rewardsPool -= rewards;
        }

        emit Unstaked(msg.sender, amount, rewards);
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

        // Transfer reduced amount (penalty stays in contract for rewards pool)
        HRK.safeTransfer(msg.sender, amountAfterPenalty);
        rewardsPool += penalty;

        emit EmergencyUnstaked(msg.sender, amountAfterPenalty, penalty);
    }

    /**
     * @notice Claim pending rewards without unstaking
     */
    function claimRewards() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No active stake");

        uint256 rewards = calculatePendingRewards(msg.sender);
        require(rewards > 0, "No rewards available");
        require(rewards <= rewardsPool, "Insufficient rewards pool");

        userStake.rewardsDebt += rewards;
        rewardsPool -= rewards;

        HRK.safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, rewards);
    }

    /**
     * @notice Calculate pending rewards for a staker
     * @param staker Address of the staker
     * @return uint256 Pending rewards in HRK
     */
    function calculatePendingRewards(address staker) public view returns (uint256) {
        Stake memory userStake = stakes[staker];
        if (userStake.amount == 0) return 0;

        TierConfig memory config = tierConfigs[userStake.tier];

        // Time staked in seconds
        uint256 stakeDuration = block.timestamp - userStake.stakedAt;

        // Base APY rewards
        uint256 baseRewards = (userStake.amount * config.baseAPYBps * stakeDuration) /
            (SECONDS_PER_YEAR * BASIS_POINTS);

        // Apply multipliers
        uint256 multiplier = calculateMultiplier(staker);
        uint256 totalRewards = (baseRewards * multiplier) / BASIS_POINTS;

        // Subtract already claimed rewards
        if (totalRewards > userStake.rewardsDebt) {
            return totalRewards - userStake.rewardsDebt;
        }

        return 0;
    }

    /**
     * @notice Calculate reward multiplier based on quality, volume, and lockup
     * @param staker Address of the staker
     * @return uint256 Multiplier in basis points (10000 = 1.0x, 20000 = 2.0x)
     */
    function calculateMultiplier(address staker) public view returns (uint256) {
        Stake memory userStake = stakes[staker];

        // M_hrscore = 1 + (avgCorrelation / 10000)
        // avgCorrelation is stored as basis points (5000 = 0.50)
        uint256 qualityMultiplier = BASIS_POINTS + userStake.avgCorrelation;

        // M_volume = 1 + log10(1 + evaluations / 100)
        // Simplified: capped at 1.5x (15000 bps)
        uint256 volumeMultiplier = BASIS_POINTS;
        if (userStake.evaluationCount > 0) {
            uint256 volumeBonus = (userStake.evaluationCount * 50); // 0.5% per evaluation
            volumeMultiplier += volumeBonus;
            if (volumeMultiplier > 15000) volumeMultiplier = 15000; // Cap at 1.5x
        }

        // M_lockup = sqrt(lockupMonths / 12)
        // Simplified: linear approximation
        uint256 lockupMultiplier = BASIS_POINTS +
            (userStake.lockupMonths * BASIS_POINTS) / 24; // Max 2x for 24 months

        // Combined multiplier
        uint256 combinedMultiplier = (qualityMultiplier * volumeMultiplier * lockupMultiplier) /
            (BASIS_POINTS * BASIS_POINTS);

        // Cap at 4x total
        if (combinedMultiplier > 40000) combinedMultiplier = 40000;

        return combinedMultiplier;
    }

    /**
     * @notice Record an evaluation completion (called by backend)
     * @param evaluator Address of the evaluator
     * @param correlation Correlation score (0-10000, 10000 = perfect 1.0)
     */
    function recordEvaluation(
        address evaluator,
        uint256 correlation
    ) external onlyRole(REWARD_MANAGER_ROLE) {
        require(correlation <= BASIS_POINTS, "Invalid correlation");

        Stake storage userStake = stakes[evaluator];
        require(userStake.amount > 0, "No active stake");

        // Update evaluation count
        userStake.evaluationCount += 1;

        // Update rolling average correlation
        uint256 totalCorrelation = (userStake.avgCorrelation * (userStake.evaluationCount - 1)) +
            correlation;
        userStake.avgCorrelation = totalCorrelation / userStake.evaluationCount;

        emit EvaluationCompleted(evaluator, userStake.evaluationCount, userStake.avgCorrelation);
    }

    /**
     * @notice Deposit rewards into the pool
     * @param amount Amount of HRK to deposit
     */
    function depositRewards(uint256 amount) external onlyRole(REWARD_MANAGER_ROLE) {
        require(amount > 0, "Amount must be > 0");

        HRK.safeTransferFrom(msg.sender, address(this), amount);
        rewardsPool += amount;
        lastRewardDistribution = block.timestamp;

        emit RewardsDistributed(amount, block.timestamp);
    }

    /**
     * @notice Update tier configuration
     * @param tier Tier to update
     * @param minimumStake New minimum stake
     * @param baseAPYBps New base APY in basis points
     * @param cooldownPeriod New cooldown period in seconds
     */
    function updateTierConfig(
        Tier tier,
        uint256 minimumStake,
        uint256 baseAPYBps,
        uint256 cooldownPeriod
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(baseAPYBps <= 5000, "APY too high"); // Max 50%
        require(cooldownPeriod <= 180 days, "Cooldown too long");

        tierConfigs[tier].minimumStake = minimumStake;
        tierConfigs[tier].baseAPYBps = baseAPYBps;
        tierConfigs[tier].cooldownPeriod = cooldownPeriod;

        emit TierConfigUpdated(tier, minimumStake, baseAPYBps, cooldownPeriod);
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
     * @notice Get contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
