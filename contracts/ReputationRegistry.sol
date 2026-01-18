// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ReputationRegistry
 * @notice Immutable audit trail for verified professional references
 * @dev Append-only registry linking payments to reference verification
 *
 * Purpose:
 * - Create permanent, on-chain record of verified references
 * - Link payment events to reference authenticity
 * - Enable reputation scoring and fraud detection
 * - Provide transparent audit trail for all stakeholders
 *
 * Data Model:
 * - Reference metadata stored on-chain
 * - Full reference content stored off-chain (IPFS/Arweave)
 * - Payment linkage for verification proof
 * - Immutable records (append-only, no updates)
 *
 * Security:
 * - Only authorized contracts can register references
 * - Dispute mechanism for fraud prevention
 * - Role-based access control
 */
contract ReputationRegistry is AccessControl, Pausable {
    // =========================
    // ROLES
    // =========================

    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // =========================
    // STRUCTS
    // =========================

    enum ReferenceStatus {
        Pending,      // Reference created but not verified
        Verified,     // Payment confirmed, reference verified
        Disputed,     // Under dispute investigation
        Fraudulent    // Confirmed fraud (slashing executed)
    }

    struct ReferenceRecord {
        bytes32 referenceId;
        address provider;           // Who wrote the reference
        address candidate;          // Who the reference is about
        bytes32 dataHash;           // IPFS/Arweave hash of reference content
        uint256 paymentAmount;      // Amount paid in RLUSD (6 decimals)
        address payer;              // Who paid for the reference
        uint256 createdAt;          // Block timestamp
        uint256 verifiedAt;         // Verification timestamp (0 if not verified)
        ReferenceStatus status;
        bool exists;
    }

    struct DisputeRecord {
        bytes32 referenceId;
        address disputer;
        string reason;
        uint256 disputedAt;
        bool resolved;
        bool upheld;                // True if dispute was upheld (reference is fraud)
    }

    // =========================
    // STATE VARIABLES
    // =========================

    /// @notice All reference records (referenceId => ReferenceRecord)
    mapping(bytes32 => ReferenceRecord) public references;

    /// @notice References by provider (provider => referenceId[])
    mapping(address => bytes32[]) public providerReferences;

    /// @notice References by candidate (candidate => referenceId[])
    mapping(address => bytes32[]) public candidateReferences;

    /// @notice Disputes (referenceId => DisputeRecord[])
    mapping(bytes32 => DisputeRecord[]) public disputes;

    /// @notice Total references registered
    uint256 public totalReferences;

    /// @notice Total verified references
    uint256 public totalVerified;

    /// @notice Total disputed references
    uint256 public totalDisputed;

    // =========================
    // EVENTS
    // =========================

    event ReferenceRegistered(
        bytes32 indexed referenceId,
        address indexed provider,
        address indexed candidate,
        bytes32 dataHash,
        uint256 timestamp
    );

    event ReferenceVerified(
        bytes32 indexed referenceId,
        address indexed verifier,
        uint256 paymentAmount,
        uint256 timestamp
    );

    event ReferenceDisputed(
        bytes32 indexed referenceId,
        address indexed disputer,
        string reason,
        uint256 timestamp
    );

    event DisputeResolved(
        bytes32 indexed referenceId,
        bool upheld,
        uint256 timestamp
    );

    event ReferenceStatusUpdated(
        bytes32 indexed referenceId,
        ReferenceStatus oldStatus,
        ReferenceStatus newStatus
    );

    // =========================
    // ERRORS
    // =========================

    error InvalidAddress();
    error InvalidReferenceId();
    error ReferenceAlreadyExists();
    error ReferenceNotFound();
    error ReferenceAlreadyVerified();
    error ReferenceAlreadyDisputed();
    error DisputeNotFound();
    error Unauthorized();

    // =========================
    // CONSTRUCTOR
    // =========================

    constructor(address admin) {
        require(admin != address(0), "Invalid admin");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // =========================
    // MAIN FUNCTIONS
    // =========================

    /**
     * @notice Register a new reference
     * @dev Can only be called by contracts with REGISTRAR_ROLE
     * @param referenceId Unique identifier for the reference
     * @param provider Address of the reference provider
     * @param candidate Address of the candidate
     * @param dataHash IPFS/Arweave hash of reference content
     */
    function registerReference(
        bytes32 referenceId,
        address provider,
        address candidate,
        bytes32 dataHash
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused {
        if (referenceId == bytes32(0)) revert InvalidReferenceId();
        if (provider == address(0)) revert InvalidAddress();
        if (candidate == address(0)) revert InvalidAddress();
        if (references[referenceId].exists) revert ReferenceAlreadyExists();

        // Create reference record
        references[referenceId] = ReferenceRecord({
            referenceId: referenceId,
            provider: provider,
            candidate: candidate,
            dataHash: dataHash,
            paymentAmount: 0,
            payer: address(0),
            createdAt: block.timestamp,
            verifiedAt: 0,
            status: ReferenceStatus.Pending,
            exists: true
        });

        // Add to provider and candidate indexes
        providerReferences[provider].push(referenceId);
        candidateReferences[candidate].push(referenceId);

        totalReferences++;

        emit ReferenceRegistered(
            referenceId,
            provider,
            candidate,
            dataHash,
            block.timestamp
        );
    }

    /**
     * @notice Verify a reference after payment confirmation
     * @dev Can only be called by contracts with VERIFIER_ROLE
     * @param referenceId Reference to verify
     * @param payer Address who paid for the reference
     * @param paymentAmount Amount paid in RLUSD
     */
    function verifyReference(
        bytes32 referenceId,
        address payer,
        uint256 paymentAmount
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        ReferenceRecord storage ref = references[referenceId];

        if (!ref.exists) revert ReferenceNotFound();
        if (ref.status == ReferenceStatus.Verified) revert ReferenceAlreadyVerified();
        if (payer == address(0)) revert InvalidAddress();

        ReferenceStatus oldStatus = ref.status;

        ref.payer = payer;
        ref.paymentAmount = paymentAmount;
        ref.verifiedAt = block.timestamp;
        ref.status = ReferenceStatus.Verified;

        totalVerified++;

        emit ReferenceVerified(
            referenceId,
            msg.sender,
            paymentAmount,
            block.timestamp
        );

        emit ReferenceStatusUpdated(
            referenceId,
            oldStatus,
            ReferenceStatus.Verified
        );
    }

    /**
     * @notice Dispute a reference for potential fraud
     * @param referenceId Reference to dispute
     * @param reason Reason for dispute
     */
    function disputeReference(
        bytes32 referenceId,
        string calldata reason
    ) external whenNotPaused {
        ReferenceRecord storage ref = references[referenceId];

        if (!ref.exists) revert ReferenceNotFound();

        // Only candidate, provider, or payer can dispute
        if (msg.sender != ref.candidate &&
            msg.sender != ref.provider &&
            msg.sender != ref.payer &&
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }

        // Create dispute record
        disputes[referenceId].push(DisputeRecord({
            referenceId: referenceId,
            disputer: msg.sender,
            reason: reason,
            disputedAt: block.timestamp,
            resolved: false,
            upheld: false
        }));

        // Update reference status
        ReferenceStatus oldStatus = ref.status;
        ref.status = ReferenceStatus.Disputed;
        totalDisputed++;

        emit ReferenceDisputed(
            referenceId,
            msg.sender,
            reason,
            block.timestamp
        );

        emit ReferenceStatusUpdated(
            referenceId,
            oldStatus,
            ReferenceStatus.Disputed
        );
    }

    /**
     * @notice Resolve a dispute
     * @dev Can only be called by admin (eventually DAO governance)
     * @param referenceId Reference with dispute
     * @param disputeIndex Index of dispute in disputes array
     * @param upheld Whether dispute is upheld (true = fraud confirmed)
     */
    function resolveDispute(
        bytes32 referenceId,
        uint256 disputeIndex,
        bool upheld
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ReferenceRecord storage ref = references[referenceId];

        if (!ref.exists) revert ReferenceNotFound();
        if (disputeIndex >= disputes[referenceId].length) revert DisputeNotFound();

        DisputeRecord storage dispute = disputes[referenceId][disputeIndex];
        require(!dispute.resolved, "Dispute already resolved");

        dispute.resolved = true;
        dispute.upheld = upheld;

        ReferenceStatus oldStatus = ref.status;
        ReferenceStatus newStatus;

        if (upheld) {
            // Dispute upheld = fraud confirmed
            newStatus = ReferenceStatus.Fraudulent;
            // Note: Slashing should be triggered off-chain by listening to this event
        } else {
            // Dispute rejected = restore to verified
            newStatus = ReferenceStatus.Verified;
        }

        ref.status = newStatus;

        emit DisputeResolved(
            referenceId,
            upheld,
            block.timestamp
        );

        emit ReferenceStatusUpdated(
            referenceId,
            oldStatus,
            newStatus
        );
    }

    // =========================
    // VIEW FUNCTIONS
    // =========================

    /**
     * @notice Get reference record
     * @param referenceId Reference to query
     * @return Reference record
     */
    function getReferenceRecord(bytes32 referenceId)
        external
        view
        returns (ReferenceRecord memory)
    {
        if (!references[referenceId].exists) revert ReferenceNotFound();
        return references[referenceId];
    }

    /**
     * @notice Get all references by a provider
     * @param provider Provider address
     * @return Array of reference IDs
     */
    function getProviderReferences(address provider)
        external
        view
        returns (bytes32[] memory)
    {
        return providerReferences[provider];
    }

    /**
     * @notice Get all references for a candidate
     * @param candidate Candidate address
     * @return Array of reference IDs
     */
    function getCandidateReferences(address candidate)
        external
        view
        returns (bytes32[] memory)
    {
        return candidateReferences[candidate];
    }

    /**
     * @notice Get disputes for a reference
     * @param referenceId Reference to query
     * @return Array of disputes
     */
    function getDisputes(bytes32 referenceId)
        external
        view
        returns (DisputeRecord[] memory)
    {
        return disputes[referenceId];
    }

    /**
     * @notice Get provider reputation stats
     * @param provider Provider address
     * @return totalRefs Total references provided
     * @return verifiedRefs Number of verified references
     * @return disputedRefs Number of disputed references
     */
    function getProviderStats(address provider)
        external
        view
        returns (
            uint256 totalRefs,
            uint256 verifiedRefs,
            uint256 disputedRefs
        )
    {
        bytes32[] memory refs = providerReferences[provider];
        totalRefs = refs.length;

        for (uint256 i = 0; i < refs.length; i++) {
            ReferenceRecord memory ref = references[refs[i]];
            if (ref.status == ReferenceStatus.Verified) {
                verifiedRefs++;
            } else if (ref.status == ReferenceStatus.Disputed ||
                       ref.status == ReferenceStatus.Fraudulent) {
                disputedRefs++;
            }
        }
    }

    /**
     * @notice Check if reference is verified
     * @param referenceId Reference to check
     * @return verified Whether reference is verified
     */
    function isVerified(bytes32 referenceId) external view returns (bool verified) {
        if (!references[referenceId].exists) return false;
        return references[referenceId].status == ReferenceStatus.Verified;
    }

    // =========================
    // ADMIN FUNCTIONS
    // =========================

    /**
     * @notice Pause contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Get contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
