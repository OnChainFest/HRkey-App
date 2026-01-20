// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HRKReferenceProof {
    struct Proof {
        address recorder;
        uint256 timestamp;
        string candidateIdentifier;
        bool exists;
    }

    mapping(bytes32 => Proof) private proofs;

    event ReferencePackProofRecorded(
        bytes32 indexed packHash,
        address indexed recorder,
        uint256 timestamp,
        string candidateIdentifier
    );

    function recordReferencePackProof(bytes32 packHash, string calldata candidateIdentifier) external {
        require(packHash != bytes32(0), "invalid pack hash");
        require(!proofs[packHash].exists, "proof already recorded");

        proofs[packHash] = Proof({
            recorder: msg.sender,
            timestamp: block.timestamp,
            candidateIdentifier: candidateIdentifier,
            exists: true
        });

        emit ReferencePackProofRecorded(packHash, msg.sender, block.timestamp, candidateIdentifier);
    }

    function getProof(bytes32 packHash)
        external
        view
        returns (address recorder, uint256 timestamp, string memory candidateIdentifier, bool exists)
    {
        Proof storage proof = proofs[packHash];
        return (proof.recorder, proof.timestamp, proof.candidateIdentifier, proof.exists);
    }
}
