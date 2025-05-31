// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./AgentTokenInternal.sol";
import "./AgentTokenExternal.sol";

// Interface for AgentFactory integration
interface IAgentFactory {
    function initFromBondingCurve(
        string memory name,
        string memory symbol,
        uint8[] memory cores,
        bytes32 tbaSalt,
        address tbaImplementation,
        uint32 daoVotingPeriod,
        uint256 daoThreshold,
        uint256 applicationThreshold_,
        address creator
    ) external returns (uint256);
}

contract BondingCurve is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Constants matching the fun system
    uint256 public constant K = 3_000_000_000_000;
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether; // 1B tokens
    uint256 public constant PRECISION = 1e18;

    // Core contracts
    IERC20 public VIRTUAL; // Payment token
    AgentTokenInternal public iToken; // Internal trading token
    AgentTokenExternal public eToken; // External agent token (after graduation)
    
    // State variables
    address public creator;
    uint256 public graduationThreshold;
    uint256 public virtualRaised;
    uint256 public tokensSold;
    bool public graduated;
    bool public tradingEnabled;
    bool public initialized;
    
    // Factory integration
    address public agentFactory;
    
    // Pricing variables (following fun system)
    uint256 public currentPrice;
    uint256 public marketCap;
    uint256 public liquidity;
    
    // Events
    event TokenLaunched(address indexed token, address indexed creator, uint256 initialPurchase);
    event Buy(address indexed buyer, uint256 virtualIn, uint256 tokensOut, uint256 newPrice);
    event Sell(address indexed seller, uint256 tokensIn, uint256 virtualOut, uint256 newPrice);
    event Graduated(address indexed token, address indexed agentToken, uint256 id);

    error InvalidTokenStatus();
    error InvalidInput();
    error SlippageTooHigh();
    error NotInitialized();
    error AlreadyInitialized();

    constructor() Ownable(msg.sender) {}

    function initialize(
        address _virtual,
        string memory name_,
        string memory symbol_,
        address _creator,
        uint256 _graduationThreshold,
        address _agentFactory,
        uint256 initialPurchase
    ) external {
        if (initialized) revert AlreadyInitialized();

        require(_virtual != address(0), "Invalid virtual token");
        require(_graduationThreshold > 0, "Invalid graduation threshold");
        require(_agentFactory != address(0), "Invalid agent factory");
        require(initialPurchase > 0, "Invalid initial purchase");

        VIRTUAL = IERC20(_virtual);
        creator = _creator;
        graduationThreshold = _graduationThreshold;
        agentFactory = _agentFactory;

        // Deploy internal token for trading on the curve
        iToken = new AgentTokenInternal(
            string.concat("fun ", name_),
            string.concat("f", symbol_),
            address(this),
            INITIAL_SUPPLY
        );

        // Calculate initial liquidity based on fun system formula
        uint256 k = ((K * 10000) / 1000); // Asset rate equivalent
        liquidity = (((k * 10000 ether) / INITIAL_SUPPLY) * 1 ether) / 10000;
        currentPrice = INITIAL_SUPPLY / liquidity;
        marketCap = liquidity;

        tradingEnabled = true;
        initialized = true;

        // Transfer ownership to creator
        _transferOwnership(_creator);

        emit TokenLaunched(address(iToken), _creator, initialPurchase);
    }

    function buy(
        uint256 amountIn,
        uint256 minTokensOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 tokensOut) {
        if (!initialized) revert NotInitialized();
        if (!tradingEnabled) revert InvalidTokenStatus();
        if (graduated) revert InvalidTokenStatus();
        if (block.timestamp > deadline) revert InvalidInput();
        if (amountIn == 0) revert InvalidInput();

        // Pull payment first
        VIRTUAL.safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate tokens out using constant product formula similar to fun system
        tokensOut = _calculateBuyAmount(amountIn);
        
        if (tokensOut < minTokensOut) revert SlippageTooHigh();
        if (tokensSold + tokensOut > INITIAL_SUPPLY) revert InvalidInput();

        // Update state
        virtualRaised += amountIn;
        tokensSold += tokensOut;
        
        // Update pricing
        _updatePricing();

        // Transfer tokens
        iToken.transfer(msg.sender, tokensOut);

        emit Buy(msg.sender, amountIn, tokensOut, currentPrice);

        // Check graduation condition - when enough tokens sold or threshold reached
        if (virtualRaised >= graduationThreshold) {
            _graduate();
        }

        return tokensOut;
    }

    function sell(
        uint256 amountIn,
        uint256 minVirtualOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 virtualOut) {
        if (!initialized) revert NotInitialized();
        if (!tradingEnabled) revert InvalidTokenStatus();
        if (graduated) revert InvalidTokenStatus();
        if (block.timestamp > deadline) revert InvalidInput();
        if (amountIn == 0) revert InvalidInput();

        // Calculate virtual out using reverse calculation
        virtualOut = _calculateSellAmount(amountIn);
        
        if (virtualOut < minVirtualOut) revert SlippageTooHigh();

        // Transfer tokens from user and burn them
        iToken.transferFrom(msg.sender, address(this), amountIn);
        
        // Update state
        virtualRaised -= virtualOut;
        tokensSold -= amountIn;
        
        // Update pricing
        _updatePricing();

        // Transfer virtual tokens
        VIRTUAL.safeTransfer(msg.sender, virtualOut);

        emit Sell(msg.sender, amountIn, virtualOut, currentPrice);

        return virtualOut;
    }

    function _calculateBuyAmount(uint256 virtualIn) internal view returns (uint256) {
        // Following fun system approach - constant product formula
        uint256 virtualReserve = liquidity;
        uint256 tokenReserve = INITIAL_SUPPLY - tokensSold;
        
        if (tokenReserve == 0) return 0;
        
        // Constant product formula: x * y = k
        uint256 k = virtualReserve * tokenReserve;
        uint256 newVirtualReserve = virtualReserve + virtualIn;
        uint256 newTokenReserve = k / newVirtualReserve;
        
        return tokenReserve - newTokenReserve;
    }

    function _calculateSellAmount(uint256 tokensIn) internal view returns (uint256) {
        // Reverse calculation for selling
        uint256 virtualReserve = liquidity;
        uint256 tokenReserve = INITIAL_SUPPLY - tokensSold;
        
        if (tokenReserve <= tokensIn) return 0;
        
        uint256 k = virtualReserve * tokenReserve;
        uint256 newTokenReserve = tokenReserve + tokensIn;
        uint256 newVirtualReserve = k / newTokenReserve;
        
        return virtualReserve - newVirtualReserve;
    }

    function _updatePricing() internal {
        uint256 tokenReserve = INITIAL_SUPPLY - tokensSold;
        if (tokenReserve > 0) {
            currentPrice = liquidity / tokenReserve;
            marketCap = liquidity * 2; // Following fun system pattern
        }
    }

    function _graduate() internal {
        require(!graduated, "Already graduated");
        
        tradingEnabled = false;
        graduated = true;

        // Deploy external agent token
        eToken = new AgentTokenExternal(
            iToken.name(),
            iToken.symbol(),
            address(this),
            INITIAL_SUPPLY
        );

        // Transfer all raised virtual tokens to agent factory for liquidity
        uint256 liquidityAmount = VIRTUAL.balanceOf(address(this));
        VIRTUAL.approve(agentFactory, liquidityAmount);

        // Call agent factory to create the full agent with DAO, etc.
        uint256 agentId = IAgentFactory(agentFactory).initFromBondingCurve(
            string.concat(iToken.name(), " by Virtuals"),
            iToken.symbol(),
            new uint8[](0), // Empty cores array for now
            bytes32(0), // Default salt
            address(0), // Default TBA implementation
            7 days, // Default voting period
            1000 ether, // Default threshold
            liquidityAmount,
            creator
        );

        emit Graduated(address(iToken), address(eToken), agentId);
    }

    function redeem(uint256 amount) external nonReentrant {
        if (!initialized) revert NotInitialized();
        if (!graduated) revert InvalidTokenStatus();
        if (amount == 0) revert InvalidInput();

        // Burn internal tokens and mint external ones 1:1
        iToken.burnFrom(msg.sender, amount);
        eToken.transfer(msg.sender, amount);
    }

    // View functions
    function getReserves() external view returns (uint256 virtualReserve, uint256 tokenReserve) {
        virtualReserve = liquidity;
        tokenReserve = INITIAL_SUPPLY - tokensSold;
    }

    function getAmountOut(uint256 amountIn, bool isBuy) external view returns (uint256) {
        if (isBuy) {
            return _calculateBuyAmount(amountIn);
        } else {
            return _calculateSellAmount(amountIn);
        }
    }

    function getTokenInfo() external view returns (
        address token,
        string memory name,
        string memory symbol,
        uint256 supply,
        uint256 price,
        uint256 marketCapValue,
        uint256 liquidityValue,
        bool trading,
        bool graduatedStatus
    ) {
        return (
            address(iToken),
            iToken.name(),
            iToken.symbol(),
            INITIAL_SUPPLY,
            currentPrice,
            marketCap,
            liquidity,
            tradingEnabled,
            graduated
        );
    }

    // Admin functions
    function setGraduationThreshold(uint256 newThreshold) external onlyOwner {
        graduationThreshold = newThreshold;
    }

    function setAgentFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "Invalid factory");
        agentFactory = newFactory;
    }
}
