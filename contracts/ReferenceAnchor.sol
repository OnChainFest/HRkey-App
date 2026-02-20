// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReferenceAnchor
 * @notice Minimal anchor contract for cryptographically verifiable professional references
 * @dev Anchors reference hashes on Base for AOC Protocol grant milestone
 */
contract ReferenceAnchor {
    event ReferenceAnchored(
        bytes32 indexed referenceHash,
        address indexed anchoringAddress,
        uint256 timestamp
    );

    uint256 public totalAnchored;

    /**
     * @notice Anchor a reference hash onchain
     * @param referenceHash Keccak256 hash of canonical reference JSON (RFC 8785)
     */
    function anchorReference(bytes32 referenceHash) external {
        require(referenceHash != bytes32(0), "ReferenceAnchor: zero hash");

        totalAnchored++;

        emit ReferenceAnchored(referenceHash, msg.sender, block.timestamp);
    }
}
