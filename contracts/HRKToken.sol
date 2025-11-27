//

 SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title HRKToken
 * @notice The native utility token of the HRKey Protocol
 * @dev ERC-20 token with:
 *      - Fixed supply: 1,000,000,000 HRK
 *      - Burnable (deflationary mechanism)
 *      - Pausable (emergency stops)
 *      - Upgradeable (UUPS proxy pattern)
 *      - Role-based access control
 */
contract HRKToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // Roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Token parameters
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // Transaction fee (basis points: 250 = 2.5%)
    uint256 public transactionFeeBps;
    uint256 public constant MAX_FEE_BPS = 500; // 5% maximum fee

    // Fee distribution
    address public treasury;
    uint256 public burnPercentage; // % of fee to burn (e.g., 40 = 40%)

    // Events
    event TransactionFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event BurnPercentageUpdated(uint256 oldPercentage, uint256 newPercentage);
    event FeesCollected(address indexed from, address indexed to, uint256 amount, uint256 fee, uint256 burned);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the HRK token
     * @param _treasury Address of the protocol treasury
     * @param _admin Address of the initial admin
     */
    function initialize(address _treasury, address _admin) public initializer {
        require(_treasury != address(0), "Invalid treasury");
        require(_admin != address(0), "Invalid admin");

        __ERC20_init("HRKey Token", "HRK");
        __ERC20Burnable_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(BURNER_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);

        // Set initial parameters
        treasury = _treasury;
        transactionFeeBps = 250; // 2.5% default fee
        burnPercentage = 40; // 40% of fees burned, 60% to treasury

        // Mint total supply to admin for distribution
        _mint(_admin, TOTAL_SUPPLY);
    }

    /**
     * @notice Pause all token transfers
     * @dev Only callable by PAUSER_ROLE
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause token transfers
     * @dev Only callable by PAUSER_ROLE
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Mint new tokens
     * @dev Only callable by MINTER_ROLE. Should rarely be used (fixed supply model).
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= TOTAL_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from an address
     * @dev Only callable by BURNER_ROLE (typically the slashing contract)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) public override onlyRole(BURNER_ROLE) {
        super.burnFrom(from, amount);
    }

    /**
     * @notice Update transaction fee
     * @param newFeeBps New fee in basis points (e.g., 250 = 2.5%)
     */
    function setTransactionFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFee = transactionFeeBps;
        transactionFeeBps = newFeeBps;
        emit TransactionFeeUpdated(oldFee, newFeeBps);
    }

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Update burn percentage of fees
     * @param newPercentage New burn percentage (0-100)
     */
    function setBurnPercentage(uint256 newPercentage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newPercentage <= 100, "Invalid percentage");
        uint256 oldPercentage = burnPercentage;
        burnPercentage = newPercentage;
        emit BurnPercentageUpdated(oldPercentage, newPercentage);
    }

    /**
     * @notice Transfer tokens with automatic fee deduction
     * @dev Overrides ERC20 transfer to implement fee mechanism
     * @param to Recipient address
     * @param amount Amount to transfer (before fees)
     * @return bool Success status
     */
    function transfer(address to, uint256 amount) public override whenNotPaused returns (bool) {
        return _transferWithFee(msg.sender, to, amount);
    }

    /**
     * @notice TransferFrom with automatic fee deduction
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer (before fees)
     * @return bool Success status
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override whenNotPaused returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, amount);
        return _transferWithFee(from, to, amount);
    }

    /**
     * @notice Internal transfer with fee logic
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer (before fees)
     * @return bool Success status
     */
    function _transferWithFee(
        address from,
        address to,
        uint256 amount
    ) internal returns (bool) {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");

        // Skip fees for:
        // 1. Staking contract transfers
        // 2. Treasury transfers
        // 3. Transfers to/from burn address
        if (
            hasRole(MINTER_ROLE, from) ||
            hasRole(MINTER_ROLE, to) ||
            from == treasury ||
            to == treasury ||
            from == BURN_ADDRESS ||
            to == BURN_ADDRESS
        ) {
            _transfer(from, to, amount);
            return true;
        }

        // Calculate fees
        uint256 fee = (amount * transactionFeeBps) / 10000;
        uint256 amountAfterFee = amount - fee;

        // Split fee: burn% burned, rest to treasury
        uint256 burnAmount = (fee * burnPercentage) / 100;
        uint256 treasuryAmount = fee - burnAmount;

        // Execute transfers
        _transfer(from, to, amountAfterFee);

        if (burnAmount > 0) {
            _transfer(from, BURN_ADDRESS, burnAmount);
        }

        if (treasuryAmount > 0) {
            _transfer(from, treasury, treasuryAmount);
        }

        emit FeesCollected(from, to, amountAfterFee, fee, burnAmount);

        return true;
    }

    /**
     * @notice Authorize contract upgrades
     * @dev Only callable by UPGRADER_ROLE
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Override required by Solidity for multiple inheritance
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @notice Get contract version
     * @return string Version number
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
