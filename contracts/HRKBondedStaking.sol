// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title HRKBondedStaking
 * @notice Bonded participation staking for HRKey protocol
 * @dev IMPORTANT INVARIANTS:
 *      1. NO REWARDS: Staking does NOT generate passive yield or APY
 *      2. CAPACITY ONLY: Staking unlocks protocol capacity and permissions
 *      3. SLASHING RISK: Staked tokens can be slashed for misbehavior
 *      4. UNBONDING PERIOD: Unstaking requires waiting period to prevent abuse
 *      5. NO HOLDER DISTRIBUTION: Slashed tokens are burned, NOT redistributed
 *
 * HRK is a UTILITY TOKEN for participation rights, NOT a pricing currency or investment.
 */
contract HRKBondedStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    IERC20Upgradeable public hrkToken;

    // Unbonding period (7 days by default)
    uint256 public unbondingPeriod;

    // Capacity tier thresholds
    uint256 public constant BASIC_TIER = 100 ether;      // 100 HRK
    uint256 public constant STANDARD_TIER = 500 ether;   // 500 HRK
    uint256 public constant PREMIUM_TIER = 2000 ether;   // 2,000 HRK
    uint256 public constant ENTERPRISE_TIER = 10000 ether; // 10,000 HRK

    struct Stake {
        uint256 amount;             // Total staked amount
        uint256 stakedAt;           // Timestamp of stake
        uint256 unstakeRequestedAt; // Timestamp of unstake request (0 if not requested)
        uint256 unstakeAmount;      // Amount requested to unstake
        bool isActive;              // Active stake flag
    }

    // User stakes
    mapping(address => Stake) public stakes;

    // Total staked in protocol
    uint256 public totalStaked;

    // Events
    event Staked(address indexed user, uint256 amount, uint256 newTotal);
    event UnstakeInitiated(address indexed user, uint256 amount, uint256 unlockTime);
    event UnstakeFinalized(address indexed user, uint256 amount);
    event UnstakeCancelled(address indexed user, uint256 amount);
    event Slashed(address indexed user, uint256 amount, string reason);
    event UnbondingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _hrkToken Address of HRK token
     * @param _unbondingPeriod Unbonding period in seconds (default 7 days)
     */
    function initialize(address _hrkToken, uint256 _unbondingPeriod) public initializer {
        require(_hrkToken != address(0), "Invalid token address");
        require(_unbondingPeriod > 0, "Invalid unbonding period");

        __ReentrancyGuard_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        hrkToken = IERC20Upgradeable(_hrkToken);
        unbondingPeriod = _unbondingPeriod;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SLASHER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    /**
     * @notice Stake HRK tokens to unlock protocol capacity
     * @dev NO REWARDS - staking only unlocks capacity/permissions
     * @param amount Amount of HRK to stake
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(hrkToken.balanceOf(msg.sender) >= amount, "Insufficient balance");

        Stake storage userStake = stakes[msg.sender];

        // Transfer tokens to contract
        require(
            hrkToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        // Update stake
        if (!userStake.isActive) {
            userStake.stakedAt = block.timestamp;
            userStake.isActive = true;
        }

        userStake.amount += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount, userStake.amount);
    }

    /**
     * @notice Initiate unstaking process
     * @dev Starts unbonding period - tokens locked until period expires
     * @param amount Amount to unstake
     */
    function initiateUnstake(uint256 amount) external nonReentrant {
        Stake storage userStake = stakes[msg.sender];

        require(userStake.isActive, "No active stake");
        require(amount > 0 && amount <= userStake.amount, "Invalid amount");
        require(userStake.unstakeRequestedAt == 0, "Unstake already pending");

        userStake.unstakeRequestedAt = block.timestamp;
        userStake.unstakeAmount = amount;

        uint256 unlockTime = block.timestamp + unbondingPeriod;
        emit UnstakeInitiated(msg.sender, amount, unlockTime);
    }

    /**
     * @notice Finalize unstake after unbonding period
     * @dev Can only be called after unbonding period expires
     */
    function finalizeUnstake() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];

        require(userStake.unstakeRequestedAt > 0, "No unstake requested");
        require(
            block.timestamp >= userStake.unstakeRequestedAt + unbondingPeriod,
            "Unbonding period not complete"
        );

        uint256 amountToUnstake = userStake.unstakeAmount;

        // Update state
        userStake.amount -= amountToUnstake;
        totalStaked -= amountToUnstake;
        userStake.unstakeRequestedAt = 0;
        userStake.unstakeAmount = 0;

        if (userStake.amount == 0) {
            userStake.isActive = false;
        }

        // Transfer tokens back
        require(hrkToken.transfer(msg.sender, amountToUnstake), "Transfer failed");

        emit UnstakeFinalized(msg.sender, amountToUnstake);
    }

    /**
     * @notice Cancel pending unstake request
     */
    function cancelUnstake() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];

        require(userStake.unstakeRequestedAt > 0, "No unstake requested");

        uint256 cancelledAmount = userStake.unstakeAmount;
        userStake.unstakeRequestedAt = 0;
        userStake.unstakeAmount = 0;

        emit UnstakeCancelled(msg.sender, cancelledAmount);
    }

    /**
     * @notice Slash a user's stake for misbehavior
     * @dev BURNS slashed tokens - NO redistribution to other stakers
     * @param user Address to slash
     * @param amount Amount to slash
     * @param reason Reason for slashing
     */
    function slash(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyRole(SLASHER_ROLE) nonReentrant {
        Stake storage userStake = stakes[user];

        require(userStake.isActive, "No active stake");
        require(amount > 0 && amount <= userStake.amount, "Invalid slash amount");

        // Reduce stake
        userStake.amount -= amount;
        totalStaked -= amount;

        if (userStake.amount == 0) {
            userStake.isActive = false;
            userStake.unstakeRequestedAt = 0;
            userStake.unstakeAmount = 0;
        }

        // CRITICAL: Burn slashed tokens (NO redistribution)
        // Slashing is ENFORCEMENT ONLY, not a reward mechanism
        require(
            hrkToken.transfer(address(0xdead), amount),
            "Burn failed"
        );

        emit Slashed(user, amount, reason);
    }

    /**
     * @notice Get capacity tier for a user
     * @param user Address to check
     * @return tier Capacity tier (0=None, 1=Basic, 2=Standard, 3=Premium, 4=Enterprise)
     */
    function getCapacityTier(address user) external view returns (uint8 tier) {
        uint256 stakedAmount = stakes[user].amount;

        if (stakedAmount >= ENTERPRISE_TIER) return 4;
        if (stakedAmount >= PREMIUM_TIER) return 3;
        if (stakedAmount >= STANDARD_TIER) return 2;
        if (stakedAmount >= BASIC_TIER) return 1;
        return 0;
    }

    /**
     * @notice Check if user has minimum stake required
     * @param user Address to check
     * @param required Minimum stake required
     * @return bool True if user has sufficient stake
     */
    function hasMinimumStake(address user, uint256 required) external view returns (bool) {
        return stakes[user].amount >= required;
    }

    /**
     * @notice Get user's total staked amount
     * @param user Address to check
     * @return amount Total staked amount
     */
    function getStakeAmount(address user) external view returns (uint256 amount) {
        return stakes[user].amount;
    }

    /**
     * @notice Get user's stake info
     * @param user Address to check
     * @return amount Total staked
     * @return stakedAt Timestamp of stake
     * @return unstakeRequestedAt Timestamp of unstake request
     * @return unstakeAmount Amount pending unstake
     * @return isActive Active status
     * @return canUnstakeAt Time when unstake can be finalized (0 if no pending unstake)
     */
    function getStakeInfo(address user)
        external
        view
        returns (
            uint256 amount,
            uint256 stakedAt,
            uint256 unstakeRequestedAt,
            uint256 unstakeAmount,
            bool isActive,
            uint256 canUnstakeAt
        )
    {
        Stake memory userStake = stakes[user];
        uint256 unlockTime = userStake.unstakeRequestedAt > 0
            ? userStake.unstakeRequestedAt + unbondingPeriod
            : 0;

        return (
            userStake.amount,
            userStake.stakedAt,
            userStake.unstakeRequestedAt,
            userStake.unstakeAmount,
            userStake.isActive,
            unlockTime
        );
    }

    /**
     * @notice Update unbonding period
     * @param newPeriod New unbonding period in seconds
     */
    function setUnbondingPeriod(uint256 newPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newPeriod > 0, "Period must be > 0");
        uint256 oldPeriod = unbondingPeriod;
        unbondingPeriod = newPeriod;
        emit UnbondingPeriodUpdated(oldPeriod, newPeriod);
    }

    /**
     * @notice Pause staking
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause staking
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Authorize upgrade
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private __gap;
}
