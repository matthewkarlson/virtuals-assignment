// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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

    event AgentCreated(address indexed curve, address indexed creator, string name, string symbol);

    constructor(address _virtual) Ownable(msg.sender) {
        require(_virtual != address(0), "invalid virtual");
        VIRTUAL = IERC20(_virtual);
    }

    function setBondingCurveImplementation(address _implementation) external onlyOwner {
        require(_implementation != address(0), "invalid impl");
        bondingCurveImplementation = _implementation;
    }

    function createAgent(
        string calldata name,
        string calldata symbol,
        uint256 deposit
    ) external returns (address curve) {
        require(bondingCurveImplementation != address(0), "impl not set");
        require(deposit >= MIN_INITIAL_DEPOSIT, "dep<min");
        require(bytes(name).length > 0, "empty name");
        require(bytes(symbol).length > 0, "empty symbol");

        // Transfer deposit first
        VIRTUAL.transferFrom(msg.sender, address(this), deposit);

        // Create minimal proxy
        curve = _createProxy(bondingCurveImplementation);
        
        // Initialize the bonding curve
        (bool success,) = curve.call(
            abi.encodeWithSignature(
                "initialize(address,string,string,address,uint256)",
                address(VIRTUAL),
                name,
                symbol,
                msg.sender,
                GRAD_THRESHOLD
            )
        );
        require(success, "init failed");

        // Approve and make initial buy
        VIRTUAL.approve(curve, deposit);
        (bool buySuccess,) = curve.call(
            abi.encodeWithSignature("buy(uint256,uint256)", deposit, 0)
        );
        require(buySuccess, "buy failed");

        agents.push(curve);
        emit AgentCreated(curve, msg.sender, name, symbol);
    }

    function allAgents() external view returns (address[] memory) {
        return agents;
    }

    function agentCount() external view returns (uint256) {
        return agents.length;
    }

    // Create minimal proxy using EIP-1167
    function _createProxy(address implementation) internal returns (address proxy) {
        bytes memory bytecode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        
        bytes32 salt = keccak256(abi.encodePacked(msg.sender, block.timestamp, agents.length));
        
        assembly {
            proxy := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        require(proxy != address(0), "proxy creation failed");
    }
}
