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

    function executeBondingCurveApplicationSalt(
        uint256 id,
        uint256 totalSupply,
        uint256 lpSupply,
        address vault,
        bytes32 salt
    ) external returns (address);
}

// Interface for Bonding contract
interface IBonding {
    function launch(
        string memory _name,
        string memory _ticker,
        uint8[] memory cores,
        string memory desc,
        string memory img,
        string[4] memory urls,
        uint256 purchaseAmount
    ) external returns (address, address, uint);
}

/**
 * @title AgentFactory
 * @dev Minimal AgentFactory for POC - handles launch forwarding and bonding curve integration
 */
contract AgentFactory is IAgentFactory, AccessControl {
    using SafeERC20 for IERC20;

    IERC20 public immutable VIRTUAL;

    bytes32 public constant BONDING_ROLE = keccak256("BONDING_ROLE");
    
    uint256 private _nextId = 1;
    address public bondingContract;
    
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
    event AgentLaunched(address indexed token, address indexed creator, uint256 initialPurchase);

    constructor(address _virtual) {
        require(_virtual != address(0), "invalid virtual");
        VIRTUAL = IERC20(_virtual);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setBondingContract(address _bondingContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bondingContract != address(0), "invalid bonding contract");
        bondingContract = _bondingContract;
        _grantRole(BONDING_ROLE, _bondingContract);
    }

    /**
     * @dev Launch a token through the Bonding contract
     */
    function launch(
        string calldata name,
        string calldata symbol,
        uint256 purchaseAmount
    ) external returns (address token, uint256 tokensOut) {
        return _launchWithParams(name, symbol, new uint8[](0), "", "", ["", "", "", ""], purchaseAmount);
    }

    /**
     * @dev Launch a token with full parameters through the Bonding contract
     */
    function launchWithParams(
        string calldata name,
        string calldata symbol,
        uint8[] calldata cores,
        string calldata description,
        string calldata image,
        string[4] calldata urls,
        uint256 purchaseAmount
    ) external returns (address token, uint256 tokensOut) {
        return _launchWithParams(name, symbol, cores, description, image, urls, purchaseAmount);
    }

    function _launchWithParams(
        string memory name,
        string memory symbol,
        uint8[] memory cores,
        string memory description,
        string memory image,
        string[4] memory urls,
        uint256 purchaseAmount
    ) internal returns (address token, uint256 tokensOut) {
        require(bondingContract != address(0), "bonding contract not set");
        require(bytes(name).length > 0, "empty name");
        require(bytes(symbol).length > 0, "empty symbol");

        // Transfer tokens from user to this contract first
        VIRTUAL.safeTransferFrom(msg.sender, address(this), purchaseAmount);
        
        // Approve the bonding contract to spend the full amount
        VIRTUAL.approve(bondingContract, purchaseAmount);

        // Launch token through the Bonding contract
        (address tokenAddress, address pairAddress, uint256 tokenIndex) = IBonding(bondingContract).launch(
            name,
            symbol,
            cores.length > 0 ? cores : _getDefaultCores(),
            description,
            image,
            urls,
            purchaseAmount
        );

        // Add the launched token to our tracking array so it shows up in the frontend
        allAgents.push(tokenAddress);

        emit AgentLaunched(tokenAddress, msg.sender, purchaseAmount);
        
        return (tokenAddress, tokensOut);
    }

    function _getDefaultCores() internal pure returns (uint8[] memory) {
        uint8[] memory defaultCores = new uint8[](1);
        defaultCores[0] = 1; // Default core value
        return defaultCores;
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
