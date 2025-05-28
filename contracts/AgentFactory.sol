// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * @title AgentFactory
 * @dev Simple factory that creates BondingCurve contracts. Uses minimal proxy pattern
 *      to avoid contract size limits.
 */
contract AgentFactory is Ownable {
    IERC20 public immutable VIRTUAL;

    uint256 public constant MIN_INITIAL_DEPOSIT = 6_000 ether;
    uint256 public constant GRAD_THRESHOLD = 42_000 ether;

    address[] public agents;
    address public bondingCurveImplementation;
    address public uniswapRouter; // Uniswap V2 Router address

    event AgentCreated(address indexed curve, address indexed creator, string name, string symbol);

    constructor(address _virtual) Ownable(msg.sender) {
        require(_virtual != address(0), "invalid virtual");
        VIRTUAL = IERC20(_virtual);
    }

    function setBondingCurveImplementation(address _implementation) external onlyOwner {
        require(_implementation != address(0), "invalid impl");
        bondingCurveImplementation = _implementation;
    }

    function setUniswapRouter(address _router) external onlyOwner {
        require(_router != address(0), "invalid router");
        uniswapRouter = _router;
    }

    function createAgent(
        string calldata name,
        string calldata symbol,
        uint256 deposit
    ) external returns (address curve) {
        require(bondingCurveImplementation != address(0), "impl not set");
        require(uniswapRouter != address(0), "router not set");
        require(deposit >= MIN_INITIAL_DEPOSIT, "dep<min");
        require(bytes(name).length > 0, "empty name");
        require(bytes(symbol).length > 0, "empty symbol");

        // Transfer deposit first
        VIRTUAL.transferFrom(msg.sender, address(this), deposit);

        // Create clone using OpenZeppelin's Clones library
        curve = Clones.clone(bondingCurveImplementation);
        
        // Initialize the bonding curve
        (bool success, bytes memory returnData) = curve.call(
            abi.encodeWithSignature(
                "initialize(address,string,string,address,uint256)",
                address(VIRTUAL),
                name,
                symbol,
                msg.sender,
                GRAD_THRESHOLD
            )
        );
        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("init failed");
            }
        }

        // Set Uniswap router
        (bool routerSuccess, bytes memory routerReturnData) = curve.call(
            abi.encodeWithSignature("setUniswapRouter(address)", uniswapRouter)
        );
        if (!routerSuccess) {
            if (routerReturnData.length > 0) {
                assembly {
                    let returndata_size := mload(routerReturnData)
                    revert(add(32, routerReturnData), returndata_size)
                }
            } else {
                revert("router set failed");
            }
        }

        // Approve and make initial buy
        VIRTUAL.approve(curve, deposit);
        (bool buySuccess, bytes memory buyReturnData) = curve.call(
            abi.encodeWithSignature("buy(uint256,uint256)", deposit, 0)
        );
        if (!buySuccess) {
            if (buyReturnData.length > 0) {
                assembly {
                    let returndata_size := mload(buyReturnData)
                    revert(add(32, buyReturnData), returndata_size)
                }
            } else {
                revert("buy failed");
            }
        }

        agents.push(curve);
        emit AgentCreated(curve, msg.sender, name, symbol);
    }

    function allAgents() external view returns (address[] memory) {
        return agents;
    }

    function agentCount() external view returns (uint256) {
        return agents.length;
    }
}
