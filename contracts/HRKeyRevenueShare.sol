// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HRKeyRevenueShare
 * @dev Smart contract for automated revenue sharing in HRKey data access payments
 *
 * When a company pays to access user data, the payment is automatically split between:
 * - Platform (HRKey)
 * - Profile owner (user)
 * - Reference creator
 *
 * Supports ERC20 tokens (e.g., USDC on Base)
 */
contract HRKeyRevenueShare is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =========================
    // STATE VARIABLES
    // =========================

    /// @notice Platform (HRKey) address that receives platform fees
    address public platformAddress;

    /// @notice Default revenue split percentages (in basis points: 100 = 1%)
    uint16 public platformFeePercent = 4000;  // 40%
    uint16 public userFeePercent = 4000;      // 40%
    uint16 public refCreatorFeePercent = 2000; // 20%

    uint16 public constant BASIS_POINTS = 10000; // 100%

    /// @notice Supported payment tokens (e.g., USDC)
    mapping(address => bool) public supportedTokens;

    // =========================
    // EVENTS
    // =========================

    event PaymentDistributed(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed profileOwner,
        address refCreator,
        address token,
        uint256 totalAmount,
        uint256 platformAmount,
        uint256 userAmount,
        uint256 refCreatorAmount
    );

    event FeePercentagesUpdated(
        uint16 platformFeePercent,
        uint16 userFeePercent,
        uint16 refCreatorFeePercent
    );

    event TokenSupportUpdated(
        address indexed token,
        bool supported
    );

    event PlatformAddressUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );

    // =========================
    // ERRORS
    // =========================

    error InvalidPercentages();
    error InvalidAmount();
    error InvalidAddress();
    error TokenNotSupported();
    error TransferFailed();

    // =========================
    // CONSTRUCTOR
    // =========================

    constructor(address _platformAddress) {
        if (_platformAddress == address(0)) revert InvalidAddress();
        platformAddress = _platformAddress;
    }

    // =========================
    // MAIN FUNCTIONS
    // =========================

    /**
     * @notice Distribute payment for data access with revenue sharing
     * @param requestId Unique identifier for the data access request
     * @param profileOwner Address of the user who owns the profile
     * @param refCreator Address of the reference creator (can be zero address if no reference)
     * @param token ERC20 token address (e.g., USDC)
     * @param totalAmount Total amount to distribute
     */
    function distributePayment(
        bytes32 requestId,
        address profileOwner,
        address refCreator,
        address token,
        uint256 totalAmount
    ) external nonReentrant {
        // Validations
        if (profileOwner == address(0)) revert InvalidAddress();
        if (token == address(0)) revert InvalidAddress();
        if (totalAmount == 0) revert InvalidAmount();
        if (!supportedTokens[token]) revert TokenNotSupported();

        IERC20 paymentToken = IERC20(token);

        // Calculate split amounts
        uint256 platformAmount = (totalAmount * platformFeePercent) / BASIS_POINTS;
        uint256 userAmount = (totalAmount * userFeePercent) / BASIS_POINTS;
        uint256 refCreatorAmount = (totalAmount * refCreatorFeePercent) / BASIS_POINTS;

        // Ensure total doesn't exceed 100% due to rounding
        uint256 totalSplit = platformAmount + userAmount + refCreatorAmount;
        if (totalSplit > totalAmount) {
            // Adjust platform amount to account for rounding
            platformAmount = totalAmount - userAmount - refCreatorAmount;
        }

        // Transfer tokens from payer to this contract first
        paymentToken.safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute to platform
        paymentToken.safeTransfer(platformAddress, platformAmount);

        // Distribute to profile owner
        paymentToken.safeTransfer(profileOwner, userAmount);

        // Distribute to reference creator (if provided)
        if (refCreator != address(0)) {
            paymentToken.safeTransfer(refCreator, refCreatorAmount);
        } else {
            // If no reference creator, send their share to platform
            paymentToken.safeTransfer(platformAddress, refCreatorAmount);
        }

        emit PaymentDistributed(
            requestId,
            msg.sender,
            profileOwner,
            refCreator,
            token,
            totalAmount,
            platformAmount,
            userAmount,
            refCreatorAmount
        );
    }

    /**
     * @notice Batch distribute payments (gas optimization)
     * @param requestIds Array of request IDs
     * @param profileOwners Array of profile owner addresses
     * @param refCreators Array of reference creator addresses
     * @param token Payment token address
     * @param amounts Array of amounts
     */
    function batchDistributePayments(
        bytes32[] calldata requestIds,
        address[] calldata profileOwners,
        address[] calldata refCreators,
        address token,
        uint256[] calldata amounts
    ) external nonReentrant {
        uint256 length = requestIds.length;
        if (
            length != profileOwners.length ||
            length != refCreators.length ||
            length != amounts.length
        ) revert InvalidAmount();

        for (uint256 i = 0; i < length; i++) {
            distributePayment(
                requestIds[i],
                profileOwners[i],
                refCreators[i],
                token,
                amounts[i]
            );
        }
    }

    // =========================
    // ADMIN FUNCTIONS
    // =========================

    /**
     * @notice Update revenue split percentages
     * @param _platformPercent Platform fee percentage (in basis points)
     * @param _userPercent User fee percentage (in basis points)
     * @param _refCreatorPercent Reference creator fee percentage (in basis points)
     */
    function updateFeePercentages(
        uint16 _platformPercent,
        uint16 _userPercent,
        uint16 _refCreatorPercent
    ) external onlyOwner {
        if (_platformPercent + _userPercent + _refCreatorPercent != BASIS_POINTS) {
            revert InvalidPercentages();
        }

        platformFeePercent = _platformPercent;
        userFeePercent = _userPercent;
        refCreatorFeePercent = _refCreatorPercent;

        emit FeePercentagesUpdated(_platformPercent, _userPercent, _refCreatorPercent);
    }

    /**
     * @notice Add or remove supported payment token
     * @param token Token address
     * @param supported Whether the token is supported
     */
    function setSupportedToken(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    /**
     * @notice Update platform address
     * @param _newPlatformAddress New platform address
     */
    function updatePlatformAddress(address _newPlatformAddress) external onlyOwner {
        if (_newPlatformAddress == address(0)) revert InvalidAddress();
        address oldAddress = platformAddress;
        platformAddress = _newPlatformAddress;
        emit PlatformAddressUpdated(oldAddress, _newPlatformAddress);
    }

    /**
     * @notice Emergency withdrawal function (only owner)
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // =========================
    // VIEW FUNCTIONS
    // =========================

    /**
     * @notice Calculate split amounts for a given total
     * @param totalAmount Total amount to split
     * @return platformAmount Amount for platform
     * @return userAmount Amount for profile owner
     * @return refCreatorAmount Amount for reference creator
     */
    function calculateSplit(uint256 totalAmount) external view returns (
        uint256 platformAmount,
        uint256 userAmount,
        uint256 refCreatorAmount
    ) {
        platformAmount = (totalAmount * platformFeePercent) / BASIS_POINTS;
        userAmount = (totalAmount * userFeePercent) / BASIS_POINTS;
        refCreatorAmount = (totalAmount * refCreatorFeePercent) / BASIS_POINTS;

        // Adjust for rounding
        uint256 totalSplit = platformAmount + userAmount + refCreatorAmount;
        if (totalSplit > totalAmount) {
            platformAmount = totalAmount - userAmount - refCreatorAmount;
        }
    }

    /**
     * @notice Check if a token is supported
     * @param token Token address to check
     * @return bool Whether the token is supported
     */
    function isTokenSupported(address token) external view returns (bool) {
        return supportedTokens[token];
    }

    /**
     * @notice Get current fee percentages
     * @return platform Platform fee percentage
     * @return user User fee percentage
     * @return refCreator Reference creator fee percentage
     */
    function getFeePercentages() external view returns (
        uint16 platform,
        uint16 user,
        uint16 refCreator
    ) {
        return (platformFeePercent, userFeePercent, refCreatorFeePercent);
    }
}
