// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

// Simple interface for what Bonding contract expects
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

/**
 * @title AgentFactory
 * @dev Minimal AgentFactory for POC - just handles the bonding curve integration
 */
contract AgentFactory is IAgentFactory, AccessControl {
    using SafeERC20 for IERC20;

    IERC20 public immutable VIRTUAL;

    bytes32 public constant BONDING_ROLE = keccak256("BONDING_ROLE");
    
    uint256 private _nextId = 1;
    
    struct Agent {
        string name;
        string symbol;
        uint8[] cores;
        address creator;
        bool exists;
    }
    
    mapping(uint256 => Agent) public agents;
    address[] public allAgents; // For compatibility

    event AgentCreated(uint256 indexed id, address indexed creator, string name, string symbol);

    constructor(address _virtual) {
        require(_virtual != address(0), "invalid virtual");
        VIRTUAL = IERC20(_virtual);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setBondingContract(address _bondingContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bondingContract != address(0), "invalid bonding contract");
        _grantRole(BONDING_ROLE, _bondingContract);
    }

    /**
     * @dev Called by bonding contract when a token graduates
     */
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
    ) external onlyRole(BONDING_ROLE) returns (uint256) {
        uint256 id = _nextId++;
        
        agents[id] = Agent({
            name: name,
            symbol: symbol,
            cores: cores,
            creator: creator,
            exists: true
        });
        
        // For compatibility, add to array
        allAgents.push(msg.sender); // Use bonding contract address as agent address for POC
        
        emit AgentCreated(id, creator, name, symbol);
        
        return id;
    }

    /**
     * @dev Stub for graduation - just returns a dummy address for POC
     */
    function executeBondingCurveApplicationSalt(
        uint256 id,
        uint256 totalSupply,
        uint256 lpSupply,
        address vault,
        bytes32 salt
    ) external onlyRole(BONDING_ROLE) returns (address) {
        // For POC, just return the bonding contract address as the "agent token"
        return msg.sender;
    }

    // View functions for compatibility
    function agentCount() external view returns (uint256) {
        return allAgents.length;
    }

    function allBondingCurves() external view returns (address[] memory) {
        return allAgents;
    }

    function bondingCurveCount() external view returns (uint256) {
        return allAgents.length;
    }
}
