// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AgentFactory
 * @dev Factory that creates BondingCurve contracts using the fun system architecture.
 *     Handles launching and graduation for proof of concept.
 */
contract AgentFactory is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable VIRTUAL;

    uint256 public constant MIN_INITIAL_DEPOSIT = 6_000 ether;
    uint256 public constant GRAD_THRESHOLD = 42_000 ether;
    uint256 public constant FEE = 1_000 ether; // 1000 VIRTUAL fee

    address[] public agents;
    address[] public bondingCurves;
    address public bondingCurveImplementation;
    address public feeTo; // Fee recipient

    // Mapping from bonding curve to graduated agent data
    mapping(address => address) public curveToAgent;
    mapping(address => bool) public authorizedCurves;

    // Agent creation data for graduated curves
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

    event AgentCreated(address indexed curve, address indexed creator, string name, string symbol);
    event AgentLaunched(address indexed token, address indexed creator, uint256 initialPurchase);
    event AgentGraduated(uint256 indexed agentId, address indexed creator, address indexed bondingCurve);

    error InvalidInput();
    error InsufficientDeposit();
    error UnauthorizedCurve();
    error AlreadyGraduated();

    constructor(address _virtual) Ownable(msg.sender) {
        require(_virtual != address(0), "invalid virtual");
        VIRTUAL = IERC20(_virtual);
        feeTo = msg.sender; // Default fee recipient to deployer
    }

    function setBondingCurveImplementation(address _implementation) external onlyOwner {
        require(_implementation != address(0), "invalid impl");
        bondingCurveImplementation = _implementation;
    }

    function setFeeTo(address _feeTo) external onlyOwner {
        require(_feeTo != address(0), "invalid fee recipient");
        feeTo = _feeTo;
    }

    /**
     * @dev Create a new bonding curve with initial purchase following fun system
     */
    function launch(
        string calldata name,
        string calldata symbol,
        uint8[] calldata cores,
        uint256 purchaseAmount
    ) external returns (address curve, uint256 tokensOut) {
        require(bondingCurveImplementation != address(0), "impl not set");
        require(purchaseAmount >= MIN_INITIAL_DEPOSIT, "insufficient deposit");
        require(bytes(name).length > 0, "empty name");
        require(bytes(symbol).length > 0, "empty symbol");
        if (purchaseAmount <= FEE) revert InsufficientDeposit();

        uint256 initialPurchase = purchaseAmount - FEE;

        // Transfer fee to feeTo and initial purchase to this contract
        VIRTUAL.safeTransferFrom(msg.sender, feeTo, FEE);
        VIRTUAL.safeTransferFrom(msg.sender, address(this), initialPurchase);

        // Create clone using OpenZeppelin's Clones library
        curve = Clones.clone(bondingCurveImplementation);
        
        // Initialize the bonding curve with new signature
        (bool success, bytes memory returnData) = curve.call(
            abi.encodeWithSignature(
                "initialize(address,string,string,address,uint256,address,uint256)",
                address(VIRTUAL),
                name,
                symbol,
                msg.sender,
                GRAD_THRESHOLD,
                address(this),
                initialPurchase
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

        // Approve and make initial buy
        VIRTUAL.approve(curve, initialPurchase);
        (bool buySuccess, bytes memory buyReturnData) = curve.call(
            abi.encodeWithSignature("buy(uint256,uint256,uint256)", initialPurchase, 0, block.timestamp + 300)
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

        // Extract tokens received from return data if needed
        if (buyReturnData.length >= 32) {
            tokensOut = abi.decode(buyReturnData, (uint256));
        }

        bondingCurves.push(curve);
        authorizedCurves[curve] = true;

        emit AgentLaunched(curve, msg.sender, initialPurchase);
        
        return (curve, tokensOut);
    }

    /**
     * @dev Called by bonding curve when it graduates to create full agent
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
        if (!authorizedCurves[msg.sender]) revert UnauthorizedCurve();
        if (curveToAgent[msg.sender] != address(0)) revert AlreadyGraduated();

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
        curveToAgent[msg.sender] = msg.sender; // Use curve address as agent address for POC
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
    ) external returns (address curve) {
        // Inline the launch logic to avoid visibility issues
        require(bondingCurveImplementation != address(0), "impl not set");
        require(deposit >= MIN_INITIAL_DEPOSIT, "insufficient deposit");
        require(bytes(name).length > 0, "empty name");
        require(bytes(symbol).length > 0, "empty symbol");
        if (deposit <= FEE) revert InsufficientDeposit();

        uint256 initialPurchase = deposit - FEE;

        // Transfer fee to feeTo and initial purchase to this contract
        VIRTUAL.safeTransferFrom(msg.sender, feeTo, FEE);
        VIRTUAL.safeTransferFrom(msg.sender, address(this), initialPurchase);

        // Create clone using OpenZeppelin's Clones library
        curve = Clones.clone(bondingCurveImplementation);
        
        // Initialize the bonding curve
        (bool success, bytes memory returnData) = curve.call(
            abi.encodeWithSignature(
                "initialize(address,string,string,address,uint256,address,uint256)",
                address(VIRTUAL),
                name,
                symbol,
                msg.sender,
                GRAD_THRESHOLD,
                address(this),
                initialPurchase
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

        // Approve and make initial buy
        VIRTUAL.approve(curve, initialPurchase);
        (bool buySuccess, bytes memory buyReturnData) = curve.call(
            abi.encodeWithSignature("buy(uint256,uint256,uint256)", initialPurchase, 0, block.timestamp + 300)
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

        // Transfer bought tokens to creator
        uint256 tokensOut;
        if (buyReturnData.length >= 32) {
            tokensOut = abi.decode(buyReturnData, (uint256));
        }

        bondingCurves.push(curve);
        authorizedCurves[curve] = true;

        emit AgentCreated(curve, msg.sender, name, symbol);
        return curve;
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

    function getAgentData(address curve) external view returns (AgentCreationData memory) {
        return pendingAgents[curve];
    }

    function isGraduated(address curve) external view returns (bool) {
        return curveToAgent[curve] != address(0);
    }

    function getGraduatedAgent(address curve) external view returns (address) {
        return curveToAgent[curve];
    }
}
