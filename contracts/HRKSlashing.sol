// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./HRKStaking.sol";

/**
 * @title HRKSlashing
 * @notice Slashing mechanism for fraudulent evaluators
 * @dev Implements 4-tier slashing system with appeals process
 *
 * CRITICAL INVARIANT: Slashed tokens are 100% BURNED (enforcement only)
 * NO REDISTRIBUTION to other stakers - slashing is NOT a reward mechanism
 */
contract HRKSlashing is
    Initializable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // Roles
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // References
    HRKStaking public stakingContract;
    IERC20 public HRK;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Slash tiers
    enum SlashTier {
        Minor,      // 10% slash
        Moderate,   // 30% slash
        Major,      // 60% slash
        Fraud       // 100% slash + ban
    }

    // Slash proposal
    struct SlashProposal {
        address evaluator;
        SlashTier tier;
        bytes32 evidenceHash;      // IPFS CID of evidence
        string reason;
        uint256 proposedAt;
        uint256 slashAmount;
        bool executed;
        bool appealed;
        uint256 appealStake;       // Stake put up for appeal
    }

    // Mappings
    mapping(uint256 => SlashProposal) public proposals;
    mapping(address => uint256[]) public evaluatorProposals;
    mapping(address => bool) public isBanned;

    // State
    uint256 public proposalCount;
    uint256 public totalSlashed;
    uint256 public totalBurned;

    // Constants
    uint256 public constant APPEALS_PERIOD = 48 hours;
    uint256 public constant APPEAL_STAKE_PERCENTAGE = 5000; // 50% of slash amount
    uint256 public constant BURN_PERCENTAGE = 100; // 100% burned (NO redistribution)

    // Slash percentages (basis points)
    uint256[4] public slashPercentages = [1000, 3000, 6000, 10000]; // 10%, 30%, 60%, 100%

    // Events
    event SlashProposed(
        uint256 indexed proposalId,
        address indexed evaluator,
        SlashTier tier,
        uint256 slashAmount,
        bytes32 evidenceHash
    );
    event SlashExecuted(
        uint256 indexed proposalId,
        address indexed evaluator,
        uint256 slashAmount,
        uint256 burned
    );
    event SlashAppealed(
        uint256 indexed proposalId,
        address indexed evaluator,
        uint256 appealStake
    );
    event AppealResolved(
        uint256 indexed proposalId,
        bool successful,
        uint256 returnedStake
    );
    event EvaluatorBanned(address indexed evaluator, uint256 proposalId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the slashing contract
     * @param _stakingContract Address of HRKStaking contract
     * @param _hrkToken Address of HRK token
     * @param _admin Address of admin
     */
    function initialize(
        address _stakingContract,
        address _hrkToken,
        address _admin
    ) public initializer {
        require(_stakingContract != address(0), "Invalid staking contract");
        require(_hrkToken != address(0), "Invalid HRK token");
        require(_admin != address(0), "Invalid admin");

        __ReentrancyGuard_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        stakingContract = HRKStaking(_stakingContract);
        HRK = IERC20(_hrkToken);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ORACLE_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
    }

    /**
     * @notice Propose a slash against an evaluator
     * @param evaluator Address of the evaluator to slash
     * @param tier Slash tier (Minor, Moderate, Major, Fraud)
     * @param evidenceHash IPFS hash of evidence
     * @param reason Human-readable reason
     */
    function proposeSlash(
        address evaluator,
        SlashTier tier,
        bytes32 evidenceHash,
        string calldata reason
    ) external onlyRole(ORACLE_ROLE) {
        require(evaluator != address(0), "Invalid evaluator");
        require(evidenceHash != bytes32(0), "Invalid evidence hash");
        require(!isBanned[evaluator], "Evaluator already banned");

        // Get evaluator's stake
        HRKStaking.Stake memory stake = stakingContract.getStake(evaluator);
        require(stake.amount > 0, "Evaluator has no stake");

        // Calculate slash amount
        uint256 slashAmount = (stake.amount * slashPercentages[uint256(tier)]) / 10000;

        // Create proposal
        uint256 proposalId = proposalCount++;
        proposals[proposalId] = SlashProposal({
            evaluator: evaluator,
            tier: tier,
            evidenceHash: evidenceHash,
            reason: reason,
            proposedAt: block.timestamp,
            slashAmount: slashAmount,
            executed: false,
            appealed: false,
            appealStake: 0
        });

        evaluatorProposals[evaluator].push(proposalId);

        emit SlashProposed(proposalId, evaluator, tier, slashAmount, evidenceHash);
    }

    /**
     * @notice Appeal a slash proposal
     * @param proposalId ID of the proposal to appeal
     * @dev Evaluator must stake 50% of slash amount to appeal
     */
    function appealSlash(uint256 proposalId) external nonReentrant {
        SlashProposal storage proposal = proposals[proposalId];
        require(msg.sender == proposal.evaluator, "Not the evaluator");
        require(!proposal.executed, "Already executed");
        require(!proposal.appealed, "Already appealed");
        require(
            block.timestamp < proposal.proposedAt + APPEALS_PERIOD,
            "Appeals period expired"
        );

        uint256 requiredStake = (proposal.slashAmount * APPEAL_STAKE_PERCENTAGE) / 10000;
        proposal.appealed = true;
        proposal.appealStake = requiredStake;

        // Transfer appeal stake
        HRK.transferFrom(msg.sender, address(this), requiredStake);

        emit SlashAppealed(proposalId, proposal.evaluator, requiredStake);
    }

    /**
     * @notice Execute a slash after appeals period
     * @param proposalId ID of the proposal to execute
     */
    function executeSlash(uint256 proposalId) external nonReentrant {
        SlashProposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(
            block.timestamp >= proposal.proposedAt + APPEALS_PERIOD,
            "Appeals period active"
        );
        require(!proposal.appealed, "Under appeal, use DAO resolution");

        proposal.executed = true;

        // Get current stake (may have changed)
        HRKStaking.Stake memory stake = stakingContract.getStake(proposal.evaluator);
        uint256 actualSlashAmount = proposal.slashAmount;
        if (actualSlashAmount > stake.amount) {
            actualSlashAmount = stake.amount; // Can't slash more than current stake
        }

        // Execute slash via staking contract
        _performSlash(proposal.evaluator, actualSlashAmount);

        // Ban if Fraud tier
        if (proposal.tier == SlashTier.Fraud) {
            isBanned[proposal.evaluator] = true;
            emit EvaluatorBanned(proposal.evaluator, proposalId);
        }

        // CRITICAL: Burn 100% of slashed tokens (NO redistribution)
        // Slashing is ENFORCEMENT ONLY, not a reward mechanism for token holders
        uint256 burnAmount = actualSlashAmount;

        // Update totals
        totalSlashed += actualSlashAmount;
        totalBurned += burnAmount;

        // Burn all slashed tokens
        HRK.transfer(BURN_ADDRESS, burnAmount);

        emit SlashExecuted(proposalId, proposal.evaluator, actualSlashAmount, burnAmount);
    }

    /**
     * @notice Resolve an appeal (DAO decision)
     * @param proposalId ID of the proposal
     * @param successful Whether the appeal was successful
     */
    function resolveAppeal(
        uint256 proposalId,
        bool successful
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        SlashProposal storage proposal = proposals[proposalId];
        require(proposal.appealed, "Not under appeal");
        require(!proposal.executed, "Already executed");

        proposal.executed = true;

        if (successful) {
            // Appeal successful: return stake, cancel slash
            HRK.transfer(proposal.evaluator, proposal.appealStake);
            emit AppealResolved(proposalId, true, proposal.appealStake);
        } else {
            // Appeal failed: slash stake + appeal stake
            uint256 totalSlash = proposal.slashAmount + proposal.appealStake;

            _performSlash(proposal.evaluator, proposal.slashAmount);

            // CRITICAL: Burn 100% of all slashed tokens (NO redistribution)
            uint256 totalBurn = totalSlash;

            totalBurned += totalBurn;
            totalSlashed += totalSlash;

            // Burn slashed amount + forfeited appeal stake
            HRK.transfer(BURN_ADDRESS, totalBurn);

            // Ban if Fraud tier
            if (proposal.tier == SlashTier.Fraud) {
                isBanned[proposal.evaluator] = true;
                emit EvaluatorBanned(proposal.evaluator, proposalId);
            }

            emit AppealResolved(proposalId, false, 0);
            emit SlashExecuted(proposalId, proposal.evaluator, totalSlash, totalBurn);
        }
    }

    /**
     * @notice Internal function to perform slash
     * @param evaluator Address to slash
     * @param amount Amount to slash
     */
    function _performSlash(address evaluator, uint256 amount) internal {
        // This would interact with staking contract
        // For now, we assume staking contract has a slash function
        // In production, this would reduce the stake balance directly
        // stakingContract.slash(evaluator, amount);

        // Transfer slashed tokens from staking contract to this contract
        HRK.transferFrom(address(stakingContract), address(this), amount);
    }

    /**
     * @notice Get proposal details
     * @param proposalId ID of the proposal
     */
    function getProposal(uint256 proposalId) external view returns (SlashProposal memory) {
        return proposals[proposalId];
    }

    /**
     * @notice Get all proposals for an evaluator
     * @param evaluator Address of evaluator
     */
    function getEvaluatorProposals(address evaluator) external view returns (uint256[] memory) {
        return evaluatorProposals[evaluator];
    }

    /**
     * @notice Get slash percentage for a tier
     * @param tier Slash tier
     */
    function getSlashPercentage(SlashTier tier) external view returns (uint256) {
        return slashPercentages[uint256(tier)];
    }

    /**
     * @notice Check if an address is banned
     * @param evaluator Address to check
     */
    function isEvaluatorBanned(address evaluator) external view returns (bool) {
        return isBanned[evaluator];
    }

    /**
     * @notice Authorize contract upgrades
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Get contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
