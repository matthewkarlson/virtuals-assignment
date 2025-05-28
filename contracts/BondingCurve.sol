// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20, ERC20}       from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20}          from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard}    from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AgentTokenInternal} from "./AgentTokenInternal.sol";
import {AgentTokenExternal} from "./AgentTokenExternal.sol";
import {IUniswapV2Factory}  from "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Pair}     from "./interfaces/IUniswapV2Pair.sol";

/**
 * @title BondingCurve
 * @notice Linear bonding curve MVP. Users purchase an internal token with
 *         EasyV. When `virtualRaised` ≥ `GRADUATION_THRESHOLD`, mint an
 *         external ERC‑20, create a Uniswap V2 pair, and add liquidity.
 *         After graduation, users can redeem internal tokens 1:1 for external tokens.
 */
contract BondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants / immutables
    // ---------------------------------------------------------------------

    uint256 public constant SUPPLY = 1_000_000_000 ether;      // 1 B tokens

    IERC20  public VIRTUAL;         // payment asset
    address public creator;         // agent creator / first buyer
    uint256 public GRADUATION_THRESHOLD; // amount of VIRTUAL to raise
    uint256 public K;               // slope constant for P(s) = K·s

    // Uniswap V2 integration
    IUniswapV2Router02 public uniswapRouter;
    IUniswapV2Factory  public uniswapFactory;
    address public uniswapPair;     // created upon graduation

    AgentTokenInternal public iToken; // internal token
    AgentTokenExternal public eToken; // external token (set on grad.)

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    uint256 public tokensSold;     // cumulative sold along the curve
    uint256 public virtualRaised;  // cumulative VIRTUAL collected
    bool    public graduated;      // curve locked & external token minted
    bool    public initialized;    // initialization flag

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Buy(address indexed buyer, uint256 virtualIn, uint256 tokensOut);
    event Graduate(address externalToken, address uniswapPair, uint256 liquidityTokens);
    event Redeem(address indexed user, uint256 amount);

    // ---------------------------------------------------------------------
    // Initialization (replaces constructor for proxy pattern)
    // ---------------------------------------------------------------------

    function initialize(
        address _virtual,
        string  memory name_,
        string  memory symbol_,
        address _creator,
        uint256 _threshold
    ) external {
        require(!initialized, "already initialized");
        require(_threshold > 0, "thr=0");
        
        VIRTUAL = IERC20(_virtual);
        GRADUATION_THRESHOLD = _threshold;
        // Fix K calculation to avoid zero: K = (2 * threshold * 1e18) / (SUPPLY^2)
        // This ensures K > 0 and maintains proper scaling
        K = (2 * _threshold * 1e18) / (SUPPLY * SUPPLY / 1e18);
        creator = _creator;

        // Deploy internal token; BondingCurve contract holds entire supply
        iToken = new AgentTokenInternal(
            string.concat("fun ", name_),
            string.concat("f", symbol_),
            address(this),
            SUPPLY
        );
        
        initialized = true;
    }

    // ---------------------------------------------------------------------
    // Configuration functions (called by factory)
    // ---------------------------------------------------------------------

    function setUniswapRouter(address _router) external {
        require(!graduated, "already graduated");
        require(_router != address(0), "invalid router");
        uniswapRouter = IUniswapV2Router02(_router);
        uniswapFactory = IUniswapV2Factory(uniswapRouter.factory());
    }

    // ---------------------------------------------------------------------
    // External functions
    // ---------------------------------------------------------------------

    /**
     * @dev Linear‑curve purchase. Caller must approve VIRTUAL beforehand.
     */
    function buy(uint256 virtualIn, uint256 minTokensOut)
        external
        nonReentrant
        returns (uint256 tokenOut)
    {
        require(initialized, "not initialized");
        require(!graduated, "graduated");
        require(virtualIn > 0, "0 in");

        // Pull payment before state changes (checks‑effects‑interactions)
        VIRTUAL.safeTransferFrom(msg.sender, address(this), virtualIn);

        // Invert area‑under‑curve to solve for Δs
        uint256 s  = tokensSold;
        uint256 radicand = (2 * virtualIn) / K + s * s;
        uint256 newS = _sqrt(radicand);
        tokenOut = newS - s;
        require(tokenOut >= minTokensOut, "slip");
        require(tokensSold + tokenOut <= SUPPLY, "sold out");

        // Book‑keeping
        tokensSold     = newS;
        virtualRaised += virtualIn;

        // Transfer internal tokens
        iToken.transfer(msg.sender, tokenOut);
        emit Buy(msg.sender, virtualIn, tokenOut);

        if (virtualRaised >= GRADUATION_THRESHOLD) {
            _graduate();
        }
    }

    /**
     * @notice After graduation, burn internal tokens to receive external ones.
     */
    function redeem(uint256 amount) external nonReentrant {
        require(initialized, "not initialized");
        require(graduated, "!grad");
        require(amount > 0, "0");
        iToken.burnFrom(msg.sender, amount);
        eToken.transfer(msg.sender, amount);
        emit Redeem(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _graduate() internal {
        require(address(uniswapRouter) != address(0), "router not set");
        
        graduated = true;
        
        // Deploy external token
        eToken = new AgentTokenExternal(
            iToken.name(), 
            iToken.symbol(), 
            address(this), 
            SUPPLY
        );

        // Create Uniswap V2 pair
        uniswapPair = uniswapFactory.createPair(address(eToken), address(VIRTUAL));

        // Calculate liquidity amounts
        uint256 tokenLiquidity = SUPPLY / 2; // 50% of total supply for liquidity
        uint256 virtualLiquidity = virtualRaised; // All raised VIRTUAL goes to liquidity

        // Approve router to spend tokens
        eToken.approve(address(uniswapRouter), tokenLiquidity);
        VIRTUAL.approve(address(uniswapRouter), virtualLiquidity);

        // Add liquidity to Uniswap V2
        (, , uint256 liquidityTokens) = uniswapRouter.addLiquidity(
            address(eToken),
            address(VIRTUAL),
            tokenLiquidity,
            virtualLiquidity,
            0, // Accept any amount of tokens
            0, // Accept any amount of VIRTUAL
            creator, // LP tokens go to creator
            block.timestamp + 300 // 5 minute deadline
        );

        emit Graduate(address(eToken), uniswapPair, liquidityTokens);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y == 0) return 0;
        uint256 x = y / 2 + 1;
        z = y;
        while (x < z) {
            z = x;
            x = (y / x + x) / 2;
        }
    }
}
