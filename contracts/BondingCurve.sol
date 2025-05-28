// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20, ERC20}       from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20}          from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard}    from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AgentTokenInternal} from "./AgentTokenInternal.sol";
import {AgentTokenExternal} from "./AgentTokenExternal.sol";

/**
 * @title BondingCurve
 * @notice Linear bonding curve MVP. Users purchase an internal token with
 *         EasyV. When `virtualRaised` ≥ `GRADUATION_THRESHOLD`, mint an
 *         external ERC‑20 and allow 1 : 1 redemptions. *No* sell‑back path is
 *         implemented to keep the MVP simple.
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
    event Graduate(address externalToken);
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
        graduated = true;
        eToken = new AgentTokenExternal(iToken.name(), iToken.symbol(), address(this), SUPPLY);
        emit Graduate(address(eToken));
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
