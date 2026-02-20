// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title HRKAnchorRegistry
/// @notice Production-grade registry for anchoring reference and consent hashes on Base.
///         Implements the HRKey Grant Architecture Spec v1.0.0 §4.
///         Replaces HRKReferenceProof.sol with full consent lifecycle support.
/// @dev Gas-optimized via struct packing. All identifiers use bytes32 (no strings in mappings).
contract HRKAnchorRegistry {

    // =========================================================================
    // STORAGE STRUCTURES
    // =========================================================================

    /// @dev Packed into 1 storage slot (20 + 8 + 1 = 29 bytes < 32 bytes)
    struct ReferenceAnchor {
        address recorder;    // 20 bytes: who anchored the reference
        uint64  timestamp;   // 8 bytes:  block.timestamp at anchor time
        bool    exists;      // 1 byte:   guard against zero-value reads
    }

    /// @dev Packed into 1 storage slot (20 + 8 + 1 + 1 = 30 bytes < 32 bytes)
    struct ConsentAnchor {
        address recorder;    // 20 bytes: who registered the consent
        uint64  timestamp;   // 8 bytes:  block.timestamp at registration
        bool    exists;      // 1 byte:   existence flag
        bool    revoked;     // 1 byte:   revocation flag
    }

    // =========================================================================
    // STATE
    // =========================================================================

    address public owner;
    address public issuer; // Backend signing wallet or multisig

    /// @notice refHash (merkle root of field hashes) → anchor metadata
    mapping(bytes32 => ReferenceAnchor) private referenceAnchors;

    /// @notice consentHash → consent anchor metadata
    mapping(bytes32 => ConsentAnchor) private consentAnchors;

    // =========================================================================
    // EVENTS
    // =========================================================================

    /// @notice Emitted when a reference hash is anchored on-chain
    /// @param refHash     SHA-256 Merkle root of reference field hashes (bytes32)
    /// @param refId       bytes32 representation of the reference UUID
    /// @param recorder    Address that submitted the anchor (issuer)
    /// @param timestamp   Block timestamp at anchor time
    event ReferenceAnchored(
        bytes32 indexed refHash,
        bytes32 indexed refId,
        address indexed recorder,
        uint64  timestamp
    );

    /// @notice Emitted when a consent hash is registered on-chain
    /// @param consentHash SHA-256 of the canonical ConsentObject body
    /// @param consentId   bytes32 representation of the consent UUID
    /// @param recorder    Address that submitted the registration (issuer)
    /// @param timestamp   Block timestamp at registration time
    event ConsentRegistered(
        bytes32 indexed consentHash,
        bytes32 indexed consentId,
        address indexed recorder,
        uint64  timestamp
    );

    /// @notice Emitted when a consent is revoked on-chain
    /// @param consentHash SHA-256 of the ConsentObject being revoked
    /// @param revoker     Address that submitted the revocation (issuer)
    /// @param timestamp   Block timestamp at revocation time
    event ConsentRevoked(
        bytes32 indexed consentHash,
        address indexed revoker,
        uint64  timestamp
    );

    /// @notice Emitted when the issuer address changes
    event IssuerChanged(address indexed oldIssuer, address indexed newIssuer);

    /// @notice Emitted when ownership transfers
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "HRKAnchorRegistry: caller is not owner");
        _;
    }

    modifier onlyIssuer() {
        require(msg.sender == issuer, "HRKAnchorRegistry: caller is not issuer");
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /// @param _issuer Initial issuer address (backend signing wallet)
    constructor(address _issuer) {
        require(_issuer != address(0), "HRKAnchorRegistry: issuer is zero address");
        owner  = msg.sender;
        issuer = _issuer;
        emit OwnershipTransferred(address(0), msg.sender);
        emit IssuerChanged(address(0), _issuer);
    }

    // =========================================================================
    // REFERENCE ANCHORING
    // =========================================================================

    /// @notice Anchor a reference's Merkle root hash on-chain.
    ///         Called by the backend issuer after computing the reference Merkle tree.
    /// @dev    refHash MUST be the SHA-256 Merkle root of all field hashes per spec §1.1.
    ///         Each refHash can only be anchored once (immutable commitment).
    /// @param  refHash Merkle root of the reference's field hashes (32 bytes)
    /// @param  refId   bytes32 encoding of the reference UUID (first 16 bytes = UUID bytes)
    function anchorReferenceHash(bytes32 refHash, bytes32 refId) external onlyIssuer {
        require(refHash  != bytes32(0), "HRKAnchorRegistry: refHash is zero");
        require(refId    != bytes32(0), "HRKAnchorRegistry: refId is zero");
        require(!referenceAnchors[refHash].exists, "HRKAnchorRegistry: already anchored");

        uint64 ts = uint64(block.timestamp);

        referenceAnchors[refHash] = ReferenceAnchor({
            recorder:  msg.sender,
            timestamp: ts,
            exists:    true
        });

        emit ReferenceAnchored(refHash, refId, msg.sender, ts);
    }

    /// @notice Verify that a reference hash is anchored on-chain.
    ///         Used by verifiers to confirm reference existence and anchor timestamp.
    /// @param  refHash Merkle root to verify
    /// @return exists    true if the hash was anchored
    /// @return recorder  address that anchored it (issuer at time of anchoring)
    /// @return timestamp block.timestamp when anchored (seconds since Unix epoch)
    function verifyReferenceAnchor(bytes32 refHash)
        external
        view
        returns (bool exists, address recorder, uint64 timestamp)
    {
        ReferenceAnchor storage anchor = referenceAnchors[refHash];
        return (anchor.exists, anchor.recorder, anchor.timestamp);
    }

    // =========================================================================
    // CONSENT REGISTRATION
    // =========================================================================

    /// @notice Register a consent hash on-chain.
    ///         Called by the backend issuer when a candidate grants consent.
    /// @dev    consentHash MUST be SHA-256 of the canonical ConsentObject body per spec §1.2.
    ///         Each consentHash can only be registered once.
    /// @param  consentHash SHA-256 of canonical ConsentObject body (32 bytes)
    /// @param  consentId   bytes32 encoding of the consent UUID
    function registerConsentHash(bytes32 consentHash, bytes32 consentId) external onlyIssuer {
        require(consentHash != bytes32(0), "HRKAnchorRegistry: consentHash is zero");
        require(consentId   != bytes32(0), "HRKAnchorRegistry: consentId is zero");
        require(!consentAnchors[consentHash].exists, "HRKAnchorRegistry: already registered");

        uint64 ts = uint64(block.timestamp);

        consentAnchors[consentHash] = ConsentAnchor({
            recorder:  msg.sender,
            timestamp: ts,
            exists:    true,
            revoked:   false
        });

        emit ConsentRegistered(consentHash, consentId, msg.sender, ts);
    }

    /// @notice Verify that a consent hash is registered and not revoked.
    ///         Used by verifiers to confirm consent is valid before trusting a disclosure proof.
    /// @param  consentHash SHA-256 of ConsentObject to verify
    /// @return valid     true if registered AND not revoked
    /// @return recorder  address that registered the consent
    /// @return timestamp block.timestamp when registered
    function verifyConsent(bytes32 consentHash)
        external
        view
        returns (bool valid, address recorder, uint64 timestamp)
    {
        ConsentAnchor storage anchor = consentAnchors[consentHash];
        bool isValid = anchor.exists && !anchor.revoked;
        return (isValid, anchor.recorder, anchor.timestamp);
    }

    /// @notice Revoke a consent on-chain.
    ///         Called by the backend issuer when a candidate revokes consent.
    ///         After revocation, verifyConsent returns valid=false for this hash.
    /// @param  consentHash SHA-256 of ConsentObject to revoke
    function revokeConsentHash(bytes32 consentHash) external onlyIssuer {
        require(consentHash != bytes32(0), "HRKAnchorRegistry: consentHash is zero");
        ConsentAnchor storage anchor = consentAnchors[consentHash];
        require(anchor.exists,   "HRKAnchorRegistry: consent not registered");
        require(!anchor.revoked, "HRKAnchorRegistry: already revoked");

        anchor.revoked = true;

        emit ConsentRevoked(consentHash, msg.sender, uint64(block.timestamp));
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /// @notice Update the issuer address (e.g. after key rotation).
    /// @param  newIssuer New backend signing wallet address
    function setIssuer(address newIssuer) external onlyOwner {
        require(newIssuer != address(0), "HRKAnchorRegistry: new issuer is zero address");
        emit IssuerChanged(issuer, newIssuer);
        issuer = newIssuer;
    }

    /// @notice Transfer contract ownership.
    /// @param  newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "HRKAnchorRegistry: new owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
