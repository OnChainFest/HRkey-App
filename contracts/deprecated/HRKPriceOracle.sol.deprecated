// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HRKPriceOracle
 * @notice Dynamic pricing oracle for candidate reference queries
 * @dev Uses Merkle proofs to verify off-chain calculated prices
 */
contract HRKPriceOracle is
    Initializable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Token references
    IERC20 public HRK;

    // Price oracle state
    bytes32 public priceRoot;                  // Merkle root of all (candidate, price) pairs
    uint256 public lastUpdate;                 // Timestamp of last price root update
    uint256 public updateCount;                // Number of updates performed

    // Price bounds (18 decimals)
    uint256 public constant P_MIN = 5 * 10**18;      // 5 HRK minimum
    uint256 public constant P_MAX = 500 * 10**18;    // 500 HRK maximum

    // Update frequency
    uint256 public constant UPDATE_INTERVAL = 6 hours;

    // Revenue distribution addresses
    address public treasury;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Revenue split percentages
    uint256 public constant CANDIDATE_SHARE = 40;    // 40%
    uint256 public constant TREASURY_SHARE = 40;     // 40%
    uint256 public constant EVALUATOR_SHARE = 20;    // 20%

    // Query tracking
    struct Query {
        address employer;
        address candidate;
        uint256 pricePaid;
        uint256 timestamp;
        bool accessGranted;
    }

    mapping(uint256 => Query) public queries;
    mapping(address => uint256[]) public candidateQueries;
    mapping(address => uint256[]) public employerQueries;
    uint256 public queryCount;

    // Statistics
    uint256 public totalRevenue;
    uint256 public totalQueriesProcessed;

    // Events
    event PriceRootUpdated(
        bytes32 indexed newRoot,
        uint256 timestamp,
        uint256 updateNumber
    );
    event QueryExecuted(
        uint256 indexed queryId,
        address indexed employer,
        address indexed candidate,
        uint256 pricePaid
    );
    event RevenueDistributed(
        uint256 indexed queryId,
        address candidate,
        uint256 candidateAmount,
        uint256 treasuryAmount,
        uint256 evaluatorAmount
    );
    event PriceVerified(
        address indexed candidate,
        uint256 priceHRK,
        bool valid
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the price oracle
     * @param _hrkToken Address of HRK token
     * @param _treasury Address of treasury
     * @param _admin Address of admin
     */
    function initialize(
        address _hrkToken,
        address _treasury,
        address _admin
    ) public initializer {
        require(_hrkToken != address(0), "Invalid HRK token");
        require(_treasury != address(0), "Invalid treasury");
        require(_admin != address(0), "Invalid admin");

        __ReentrancyGuard_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        HRK = IERC20(_hrkToken);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ORACLE_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
    }

    /**
     * @notice Update the Merkle root of candidate prices
     * @param newRoot New Merkle root
     * @dev Only callable by ORACLE_ROLE (backend service)
     */
    function updatePriceRoot(bytes32 newRoot) external onlyRole(ORACLE_ROLE) {
        require(newRoot != bytes32(0), "Invalid root");
        require(
            block.timestamp >= lastUpdate + UPDATE_INTERVAL,
            "Update too frequent"
        );

        priceRoot = newRoot;
        lastUpdate = block.timestamp;
        updateCount++;

        emit PriceRootUpdated(newRoot, block.timestamp, updateCount);
    }

    /**
     * @notice Verify a candidate's price using Merkle proof
     * @param candidate Candidate's wallet address
     * @param priceHRK Claimed price in HRK (18 decimals)
     * @param merkleProof Merkle proof for (candidate, price) pair
     * @return bool True if price is valid
     */
    function verifyPrice(
        address candidate,
        uint256 priceHRK,
        bytes32[] calldata merkleProof
    ) public view returns (bool) {
        require(candidate != address(0), "Invalid candidate");
        require(priceHRK >= P_MIN && priceHRK <= P_MAX, "Price out of bounds");
        require(priceRoot != bytes32(0), "Price root not set");

        bytes32 leaf = keccak256(abi.encodePacked(candidate, priceHRK));
        bool valid = MerkleProof.verify(merkleProof, priceRoot, leaf);

        emit PriceVerified(candidate, priceHRK, valid);

        return valid;
    }

    /**
     * @notice Query a candidate's references
     * @param candidate Candidate's wallet address
     * @param priceHRK Price in HRK (must match oracle price)
     * @param merkleProof Merkle proof for price verification
     * @param evaluators List of evaluators to compensate
     * @return queryId ID of the query
     */
    function queryCandidate(
        address candidate,
        uint256 priceHRK,
        bytes32[] calldata merkleProof,
        address[] calldata evaluators
    ) external nonReentrant returns (uint256) {
        require(candidate != address(0), "Invalid candidate");
        require(evaluators.length > 0, "No evaluators specified");

        // 1. Verify price via Merkle proof
        require(
            verifyPrice(candidate, priceHRK, merkleProof),
            "Invalid price proof"
        );

        // 2. Transfer HRK from employer
        HRK.safeTransferFrom(msg.sender, address(this), priceHRK);

        // 3. Create query record
        uint256 queryId = queryCount++;
        queries[queryId] = Query({
            employer: msg.sender,
            candidate: candidate,
            pricePaid: priceHRK,
            timestamp: block.timestamp,
            accessGranted: false
        });

        candidateQueries[candidate].push(queryId);
        employerQueries[msg.sender].push(queryId);

        // 4. Distribute revenue
        _distributeRevenue(queryId, candidate, priceHRK, evaluators);

        // 5. Update statistics
        totalRevenue += priceHRK;
        totalQueriesProcessed++;

        emit QueryExecuted(queryId, msg.sender, candidate, priceHRK);

        return queryId;
    }

    /**
     * @notice Internal function to distribute query revenue
     * @param queryId ID of the query
     * @param candidate Candidate address
     * @param amount Total amount to distribute
     * @param evaluators List of evaluators
     */
    function _distributeRevenue(
        uint256 queryId,
        address candidate,
        uint256 amount,
        address[] calldata evaluators
    ) internal {
        // Calculate shares
        uint256 candidateAmount = (amount * CANDIDATE_SHARE) / 100;
        uint256 treasuryAmount = (amount * TREASURY_SHARE) / 100;
        uint256 evaluatorAmount = (amount * EVALUATOR_SHARE) / 100;

        // Transfer to candidate
        HRK.safeTransfer(candidate, candidateAmount);

        // Transfer to treasury
        HRK.safeTransfer(treasury, treasuryAmount);

        // Distribute to evaluators (split equally)
        uint256 perEvaluator = evaluatorAmount / evaluators.length;
        for (uint256 i = 0; i < evaluators.length; i++) {
            if (evaluators[i] != address(0)) {
                HRK.safeTransfer(evaluators[i], perEvaluator);
            }
        }

        emit RevenueDistributed(
            queryId,
            candidate,
            candidateAmount,
            treasuryAmount,
            evaluatorAmount
        );
    }

    /**
     * @notice Grant access to query results (called by backend after payment)
     * @param queryId ID of the query
     */
    function grantAccess(uint256 queryId) external onlyRole(ORACLE_ROLE) {
        require(queryId < queryCount, "Invalid query ID");
        require(!queries[queryId].accessGranted, "Access already granted");

        queries[queryId].accessGranted = true;
    }

    /**
     * @notice Get query details
     * @param queryId ID of the query
     */
    function getQuery(uint256 queryId) external view returns (Query memory) {
        require(queryId < queryCount, "Invalid query ID");
        return queries[queryId];
    }

    /**
     * @notice Get all queries for a candidate
     * @param candidate Candidate address
     */
    function getCandidateQueries(address candidate) external view returns (uint256[] memory) {
        return candidateQueries[candidate];
    }

    /**
     * @notice Get all queries by an employer
     * @param employer Employer address
     */
    function getEmployerQueries(address employer) external view returns (uint256[] memory) {
        return employerQueries[employer];
    }

    /**
     * @notice Get current price root and last update time
     */
    function getPriceInfo() external view returns (
        bytes32 root,
        uint256 timestamp,
        uint256 updates
    ) {
        return (priceRoot, lastUpdate, updateCount);
    }

    /**
     * @notice Get price bounds
     */
    function getPriceBounds() external pure returns (uint256 min, uint256 max) {
        return (P_MIN, P_MAX);
    }

    /**
     * @notice Get statistics
     */
    function getStatistics() external view returns (
        uint256 _totalRevenue,
        uint256 _totalQueries,
        uint256 _avgPrice
    ) {
        uint256 avgPrice = totalQueriesProcessed > 0
            ? totalRevenue / totalQueriesProcessed
            : 0;

        return (totalRevenue, totalQueriesProcessed, avgPrice);
    }

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }

    /**
     * @notice Emergency withdraw (only for stuck funds)
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) {
            payable(treasury).transfer(amount);
        } else {
            IERC20(token).safeTransfer(treasury, amount);
        }
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
