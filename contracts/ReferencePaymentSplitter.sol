// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReferencePaymentSplitter
 * @notice Atomic payment splitting for professional reference purchases using RLUSD
 * @dev Production-grade payment rail for HRKey platform
 *
 * Payment Flow:
 * 1. Enterprise pays N RLUSD for verified reference
 * 2. Contract atomically splits payment:
 *    - 60% → Reference provider
 *    - 20% → Candidate (profile owner)
 *    - 15% → HRKey treasury
 *    - 5% → HRK staking reward pool
 * 3. Emits detailed event for off-chain processing
 * 4. All operations are atomic (all or nothing)
 *
 * Security Features:
 * - ReentrancyGuard on all state-changing functions
 * - Pausable for emergency situations
 * - Input validation on all parameters
 * - SafeERC20 for token transfers
 * - Event emission for audit trail
 */
contract ReferencePaymentSplitter is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // =========================
    // STATE VARIABLES
    // =========================

    /// @notice RLUSD token contract (Ripple USD stablecoin on Base)
    IERC20 public immutable RLUSD;

    /// @notice HRKey treasury address (multisig recommended)
    address public treasury;

    /// @notice HRK staking pool address (HRKStaking contract)
    address public stakingPool;

    /// @notice Payment split percentages in basis points (10000 = 100%)
    uint16 public constant PROVIDER_BPS = 6000;  // 60%
    uint16 public constant CANDIDATE_BPS = 2000; // 20%
    uint16 public constant TREASURY_BPS = 1500;  // 15%
    uint16 public constant STAKING_BPS = 500;    // 5%
    uint16 public constant BASIS_POINTS = 10000;

    /// @notice Track processed payments to prevent double-processing
    mapping(bytes32 => bool) public processedPayments;

    // =========================
    // STRUCTS
    // =========================

    struct PaymentSplit {
        address referenceProvider;
        address candidate;
        address treasury;
        address stakingPool;
        uint256 providerAmount;
        uint256 candidateAmount;
        uint256 treasuryAmount;
        uint256 stakingAmount;
        uint256 totalAmount;
    }

    // =========================
    // EVENTS
    // =========================

    event PaymentProcessed(
        bytes32 indexed referenceId,
        address indexed payer,
        address indexed referenceProvider,
        address candidate,
        uint256 totalAmount,
        PaymentSplit split,
        uint256 timestamp
    );

    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    event StakingPoolUpdated(
        address indexed oldStakingPool,
        address indexed newStakingPool
    );

    event EmergencyPause(
        address indexed admin,
        uint256 timestamp
    );

    event EmergencyUnpause(
        address indexed admin,
        uint256 timestamp
    );

    // =========================
    // ERRORS
    // =========================

    error InvalidAddress();
    error InvalidAmount();
    error PaymentAlreadyProcessed();
    error InvalidSplitSum();
    error TransferFailed();

    // =========================
    // CONSTRUCTOR
    // =========================

    /**
     * @notice Initialize payment splitter contract
     * @param _rlusdToken RLUSD token contract address on Base
     * @param _treasury HRKey treasury address (multisig recommended)
     * @param _stakingPool HRKStaking contract address
     */
    constructor(
        address _rlusdToken,
        address _treasury,
        address _stakingPool
    ) Ownable(msg.sender) {
        if (_rlusdToken == address(0)) revert InvalidAddress();
        if (_treasury == address(0)) revert InvalidAddress();
        if (_stakingPool == address(0)) revert InvalidAddress();

        // Verify split percentages sum to 100%
        if (PROVIDER_BPS + CANDIDATE_BPS + TREASURY_BPS + STAKING_BPS != BASIS_POINTS) {
            revert InvalidSplitSum();
        }

        RLUSD = IERC20(_rlusdToken);
        treasury = _treasury;
        stakingPool = _stakingPool;
    }

    // =========================
    // MAIN FUNCTIONS
    // =========================

    /**
     * @notice Process payment for a reference purchase
     * @dev Atomically splits payment between all recipients
     * @param referenceId Unique identifier for the reference
     * @param referenceProvider Address of the reference provider
     * @param candidate Address of the candidate (profile owner)
     * @param amount Total amount in RLUSD (6 decimals)
     * @return success Whether payment was processed successfully
     */
    function processPayment(
        bytes32 referenceId,
        address referenceProvider,
        address candidate,
        uint256 amount
    ) external nonReentrant whenNotPaused returns (bool success) {
        // Input validation
        if (referenceId == bytes32(0)) revert InvalidAmount();
        if (referenceProvider == address(0)) revert InvalidAddress();
        if (candidate == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (processedPayments[referenceId]) revert PaymentAlreadyProcessed();

        // Calculate split amounts
        uint256 providerAmount = (amount * PROVIDER_BPS) / BASIS_POINTS;
        uint256 candidateAmount = (amount * CANDIDATE_BPS) / BASIS_POINTS;
        uint256 treasuryAmount = (amount * TREASURY_BPS) / BASIS_POINTS;
        uint256 stakingAmount = (amount * STAKING_BPS) / BASIS_POINTS;

        // Handle rounding errors by adjusting treasury amount
        uint256 totalSplit = providerAmount + candidateAmount + treasuryAmount + stakingAmount;
        if (totalSplit < amount) {
            treasuryAmount += (amount - totalSplit);
        } else if (totalSplit > amount) {
            treasuryAmount -= (totalSplit - amount);
        }

        // Transfer RLUSD from payer to contract
        RLUSD.safeTransferFrom(msg.sender, address(this), amount);

        // Atomically distribute to all recipients
        RLUSD.safeTransfer(referenceProvider, providerAmount);
        RLUSD.safeTransfer(candidate, candidateAmount);
        RLUSD.safeTransfer(treasury, treasuryAmount);
        RLUSD.safeTransfer(stakingPool, stakingAmount);

        // Mark payment as processed
        processedPayments[referenceId] = true;

        // Create split struct for event
        PaymentSplit memory split = PaymentSplit({
            referenceProvider: referenceProvider,
            candidate: candidate,
            treasury: treasury,
            stakingPool: stakingPool,
            providerAmount: providerAmount,
            candidateAmount: candidateAmount,
            treasuryAmount: treasuryAmount,
            stakingAmount: stakingAmount,
            totalAmount: amount
        });

        // Emit event for off-chain processing
        emit PaymentProcessed(
            referenceId,
            msg.sender,
            referenceProvider,
            candidate,
            amount,
            split,
            block.timestamp
        );

        return true;
    }

    /**
     * @notice Batch process multiple payments (gas optimization)
     * @param referenceIds Array of reference IDs
     * @param referenceProviders Array of reference provider addresses
     * @param candidates Array of candidate addresses
     * @param amounts Array of payment amounts
     * @return success Whether all payments were processed successfully
     */
    function batchProcessPayments(
        bytes32[] calldata referenceIds,
        address[] calldata referenceProviders,
        address[] calldata candidates,
        uint256[] calldata amounts
    ) external nonReentrant whenNotPaused returns (bool success) {
        uint256 length = referenceIds.length;
        if (length != referenceProviders.length ||
            length != candidates.length ||
            length != amounts.length) {
            revert InvalidAmount();
        }

        for (uint256 i = 0; i < length; i++) {
            // Call internal logic directly to avoid reentrancy overhead
            _processSinglePayment(
                referenceIds[i],
                referenceProviders[i],
                candidates[i],
                amounts[i]
            );
        }

        return true;
    }

    // =========================
    // INTERNAL FUNCTIONS
    // =========================

    function _processSinglePayment(
        bytes32 referenceId,
        address referenceProvider,
        address candidate,
        uint256 amount
    ) internal {
        if (referenceId == bytes32(0)) revert InvalidAmount();
        if (referenceProvider == address(0)) revert InvalidAddress();
        if (candidate == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (processedPayments[referenceId]) revert PaymentAlreadyProcessed();

        uint256 providerAmount = (amount * PROVIDER_BPS) / BASIS_POINTS;
        uint256 candidateAmount = (amount * CANDIDATE_BPS) / BASIS_POINTS;
        uint256 treasuryAmount = (amount * TREASURY_BPS) / BASIS_POINTS;
        uint256 stakingAmount = (amount * STAKING_BPS) / BASIS_POINTS;

        uint256 totalSplit = providerAmount + candidateAmount + treasuryAmount + stakingAmount;
        if (totalSplit != amount) {
            treasuryAmount += (amount - totalSplit);
        }

        RLUSD.safeTransferFrom(msg.sender, address(this), amount);
        RLUSD.safeTransfer(referenceProvider, providerAmount);
        RLUSD.safeTransfer(candidate, candidateAmount);
        RLUSD.safeTransfer(treasury, treasuryAmount);
        RLUSD.safeTransfer(stakingPool, stakingAmount);

        processedPayments[referenceId] = true;

        PaymentSplit memory split = PaymentSplit({
            referenceProvider: referenceProvider,
            candidate: candidate,
            treasury: treasury,
            stakingPool: stakingPool,
            providerAmount: providerAmount,
            candidateAmount: candidateAmount,
            treasuryAmount: treasuryAmount,
            stakingAmount: stakingAmount,
            totalAmount: amount
        });

        emit PaymentProcessed(
            referenceId,
            msg.sender,
            referenceProvider,
            candidate,
            amount,
            split,
            block.timestamp
        );
    }

    // =========================
    // ADMIN FUNCTIONS
    // =========================

    /**
     * @notice Update treasury address
     * @param _newTreasury New treasury address
     */
    function updateTreasury(address _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury);
    }

    /**
     * @notice Update staking pool address
     * @param _newStakingPool New staking pool address
     */
    function updateStakingPool(address _newStakingPool) external onlyOwner {
        if (_newStakingPool == address(0)) revert InvalidAddress();
        address oldStakingPool = stakingPool;
        stakingPool = _newStakingPool;
        emit StakingPoolUpdated(oldStakingPool, _newStakingPool);
    }

    /**
     * @notice Pause contract in emergency
     */
    function emergencyPause() external onlyOwner {
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
    }

    /**
     * @notice Unpause contract
     */
    function emergencyUnpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }

    // =========================
    // VIEW FUNCTIONS
    // =========================

    /**
     * @notice Get payment details for a reference
     * @param referenceId Reference ID to query
     * @return wasProcessed Whether payment was processed
     */
    function getPaymentStatus(bytes32 referenceId) external view returns (bool wasProcessed) {
        return processedPayments[referenceId];
    }

    /**
     * @notice Calculate split amounts for a given payment
     * @param amount Total payment amount
     * @return providerAmount Amount for reference provider
     * @return candidateAmount Amount for candidate
     * @return treasuryAmount Amount for treasury
     * @return stakingAmount Amount for staking pool
     */
    function calculateSplit(uint256 amount) external pure returns (
        uint256 providerAmount,
        uint256 candidateAmount,
        uint256 treasuryAmount,
        uint256 stakingAmount
    ) {
        providerAmount = (amount * PROVIDER_BPS) / BASIS_POINTS;
        candidateAmount = (amount * CANDIDATE_BPS) / BASIS_POINTS;
        treasuryAmount = (amount * TREASURY_BPS) / BASIS_POINTS;
        stakingAmount = (amount * STAKING_BPS) / BASIS_POINTS;

        // Adjust for rounding
        uint256 totalSplit = providerAmount + candidateAmount + treasuryAmount + stakingAmount;
        if (totalSplit != amount) {
            treasuryAmount += (amount - totalSplit);
        }
    }

    /**
     * @notice Get contract configuration
     * @return _rlusd RLUSD token address
     * @return _treasury Treasury address
     * @return _stakingPool Staking pool address
     */
    function getConfig() external view returns (
        address _rlusd,
        address _treasury,
        address _stakingPool
    ) {
        return (address(RLUSD), treasury, stakingPool);
    }

    /**
     * @notice Get split percentages
     * @return provider Provider percentage in basis points
     * @return candidate Candidate percentage in basis points
     * @return treasuryPct Treasury percentage in basis points
     * @return staking Staking percentage in basis points
     */
    function getSplitPercentages() external pure returns (
        uint16 provider,
        uint16 candidate,
        uint16 treasuryPct,
        uint16 staking
    ) {
        return (PROVIDER_BPS, CANDIDATE_BPS, TREASURY_BPS, STAKING_BPS);
    }

    /**
     * @notice Get contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
