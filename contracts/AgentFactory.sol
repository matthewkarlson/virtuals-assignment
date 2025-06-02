// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Import the fun system Bonding contract interface
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
    
    function tokenInfo(address token) external view returns (
        address creator,
        address token_,
        address pair,
        address agentToken,
        uint8 dataStructFields, // Simplified for interface
        string memory description,
        uint8[] memory cores,
        string memory image,
        string memory twitter,
        string memory telegram,
        string memory youtube,
        string memory website,
        bool trading,
        bool tradingOnUniswap
    );
}

/**
 * @title AgentFactory
 * @dev Factory that creates tokens using the fun system Bonding contract.
 *     Handles launching and graduation for proof of concept.
 */
contract AgentFactory is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable VIRTUAL;

    uint256 public constant MIN_INITIAL_DEPOSIT = 6_000 ether;
    uint256 public constant FEE = 1_000 ether; // 1000 VIRTUAL fee

    address[] public agents;
    address[] public bondingCurves; // Track created tokens for compatibility
    address public bondingContract; // Single Bonding contract instance
    address public feeTo; // Fee recipient

    // Mapping from token to agent data
    mapping(address => address) public tokenToAgent;
    mapping(address => bool) public authorizedTokens;

    // Agent creation data for graduated tokens
    struct AgentCreationData {
        string name;
        string symbol;
        uint8[] cores;
        bytes32 tbaSalt;
        address tbaImplementation;
        uint32 daoVotingPeriod;
        uint256 daoThreshold;
        uint256 applicationThreshold;
        address creator;
        bool created;
    }

    mapping(address => AgentCreationData) public pendingAgents;

    event AgentCreated(address indexed token, address indexed creator, string name, string symbol);
    event AgentLaunched(address indexed token, address indexed creator, uint256 initialPurchase);
    event AgentGraduated(uint256 indexed agentId, address indexed creator, address indexed token);

    error InvalidInput();
    error InsufficientDeposit();
    error UnauthorizedToken();
    error AlreadyGraduated();

    constructor(address _virtual) Ownable(msg.sender) {
        require(_virtual != address(0), "invalid virtual");
        VIRTUAL = IERC20(_virtual);
        feeTo = msg.sender; // Default fee recipient to deployer
    }

    function setBondingContract(address _bondingContract) external onlyOwner {
        require(_bondingContract != address(0), "invalid bonding contract");
        bondingContract = _bondingContract;
    }

    function setFeeTo(address _feeTo) external onlyOwner {
        require(_feeTo != address(0), "invalid fee recipient");
        feeTo = _feeTo;
    }

    /**
     * @dev Create a new token using the fun system
     */
    function launch(
        string calldata name,
        string calldata symbol,
        uint256 purchaseAmount
    ) external returns (address token, uint256 tokensOut) {
        return _launchWithParams(name, symbol, new uint8[](0), "", "", ["", "", "", ""], purchaseAmount);
    }

    /**
     * @dev Create a new token with full parameters
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
        require(purchaseAmount >= MIN_INITIAL_DEPOSIT, "insufficient deposit");
        require(bytes(name).length > 0, "empty name");
        require(bytes(symbol).length > 0, "empty symbol");
        if (purchaseAmount <= FEE) revert InsufficientDeposit();

        // Transfer total amount to this contract first
        VIRTUAL.safeTransferFrom(msg.sender, address(this), purchaseAmount);
        
        // Transfer fee to feeTo
        VIRTUAL.safeTransfer(feeTo, FEE);
        
        // Approve bonding contract to spend the remaining amount
        uint256 launchAmount = purchaseAmount - FEE;
        VIRTUAL.approve(bondingContract, launchAmount);

        // Launch token through the Bonding contract
        (address tokenAddress, address pairAddress, uint256 tokenIndex) = IBonding(bondingContract).launch(
            name,
            symbol,
            cores.length > 0 ? cores : _getDefaultCores(),
            description,
            image,
            urls,
            launchAmount
        );

        // Track the created token
        bondingCurves.push(tokenAddress);
        authorizedTokens[tokenAddress] = true;

        emit AgentLaunched(tokenAddress, msg.sender, launchAmount);
        
        return (tokenAddress, tokensOut); // tokensOut would need to be calculated from the bonding contract if needed
    }

    function _getDefaultCores() internal pure returns (uint8[] memory) {
        uint8[] memory defaultCores = new uint8[](1);
        defaultCores[0] = 1; // Default core value
        return defaultCores;
    }

    /**
     * @dev Called by bonding contract when a token graduates to create full agent
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
    ) external returns (uint256) {
        // This would be called by the Bonding contract, so we need to verify the caller
        // For now, we'll allow any caller but in production should verify it's from bonding contract
        
        // Create a simple agent ID for the proof of concept
        uint256 agentId = uint256(keccak256(abi.encodePacked(
            msg.sender,
            name,
            symbol,
            block.timestamp
        )));

        // Store the agent creation data
        pendingAgents[msg.sender] = AgentCreationData({
            name: name,
            symbol: symbol,
            cores: cores,
            tbaSalt: tbaSalt,
            tbaImplementation: tbaImplementation,
            daoVotingPeriod: daoVotingPeriod,
            daoThreshold: daoThreshold,
            applicationThreshold: applicationThreshold_,
            creator: creator,
            created: true
        });

        // Mark as graduated
        tokenToAgent[msg.sender] = msg.sender; // Use token address as agent address for POC
        agents.push(msg.sender);

        emit AgentGraduated(agentId, creator, msg.sender);

        return agentId;
    }

    /**
     * @dev Legacy function for backward compatibility
     */
    function createAgent(
        string calldata name,
        string calldata symbol,
        uint256 deposit
    ) external returns (address token) {
        (address tokenAddress, ) = _launchWithParams(name, symbol, new uint8[](0), "", "", ["", "", "", ""], deposit);
        
        emit AgentCreated(tokenAddress, msg.sender, name, symbol);
        return tokenAddress;
    }

    // View functions
    function allAgents() external view returns (address[] memory) {
        return agents;
    }

    function agentCount() external view returns (uint256) {
        return agents.length;
    }

    function allBondingCurves() external view returns (address[] memory) {
        return bondingCurves;
    }

    function bondingCurveCount() external view returns (uint256) {
        return bondingCurves.length;
    }

    function getAgentData(address token) external view returns (AgentCreationData memory) {
        return pendingAgents[token];
    }

    function isGraduated(address token) external view returns (bool) {
        return tokenToAgent[token] != address(0);
    }

    function getGraduatedAgent(address token) external view returns (address) {
        return tokenToAgent[token];
    }

    // For compatibility - these would be individual tokens now, not bonding curves
    function curveToAgent(address token) external view returns (address) {
        return tokenToAgent[token];
    }

    function authorizedCurves(address token) external view returns (bool) {
        return authorizedTokens[token];
    }
}
