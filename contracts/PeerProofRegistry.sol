// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PeerProofRegistry {
    enum Status { None, Active, Suppressed, Revoked }

    struct Reference {
        address employee;
        address reviewer;
        bytes32 dataHash;
        uint64  createdAt;
        Status  status;
    }

    mapping (bytes32 => Reference) public references;

    event ReferenceCreated(bytes32 indexed refId, address indexed employee, address indexed reviewer, bytes32 dataHash);
    event ReferenceStatusChanged(bytes32 indexed refId, Status newStatus);

    function createReference(bytes32 refId, address employee, address reviewer, bytes32 dataHash) external {
        require(refId != bytes32(0), "bad refId");
        require(references[refId].createdAt == 0, "already exists");
        require(employee != address(0), "bad employee");

        references[refId] = Reference({
            employee: employee,
            reviewer: reviewer,
            dataHash: dataHash,
            createdAt: uint64(block.timestamp),
            status: Status.Active
        });

        emit ReferenceCreated(refId, employee, reviewer, dataHash);
    }

    function suppress(bytes32 refId) external {
        Reference storage r = references[refId];
        require(r.createdAt != 0, "not found");
        require(msg.sender == r.employee, "only employee");
        require(r.status == Status.Active, "not active");
        r.status = Status.Suppressed;
        emit ReferenceStatusChanged(refId, r.status);
    }

    function revoke(bytes32 refId) external {
        Reference storage r = references[refId];
        require(r.createdAt != 0, "not found");
        require(msg.sender == r.reviewer, "only reviewer");
        require(r.status == Status.Active, "not active");
        r.status = Status.Revoked;
        emit ReferenceStatusChanged(refId, r.status);
    }
}
