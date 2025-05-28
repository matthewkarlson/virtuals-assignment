// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20}        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable}       from "@openzeppelin/contracts/access/Ownable.sol";
import {BondingCurve}  from "./BondingCurve.sol";

/**
 * @title AgentFactory
 * @dev Deploys a new `BondingCurve` for each agent. Requires a minimum initial
 *      deposit so the starting price > 0. For simplicity the factory itself
 *      forwards the creator's deposit into the new curve via an immediate buy.
 */
contract AgentFactory is Ownable {
    IERC20  public immutable VIRTUAL;

    uint256 public constant MIN_INITIAL_DEPOSIT = 6_000 ether;
    uint256 public constant GRAD_THRESHOLD      = 42_000 ether;

    BondingCurve[] public agents;

    event AgentCreated(address curve, address creator, string name, string symbol);

    constructor(address _virtual) Ownable(msg.sender) {
        VIRTUAL = IERC20(_virtual);
    }

    function createAgent(
        string calldata name,
        string calldata symbol,
        uint256 deposit
    ) external returns (address curve) {
        require(deposit >= MIN_INITIAL_DEPOSIT, "dep<min");
        VIRTUAL.transferFrom(msg.sender, address(this), deposit);

        BondingCurve bc = new BondingCurve(address(VIRTUAL), name, symbol, msg.sender, GRAD_THRESHOLD);

        // seed curve with creator's deposit via first buy (no minTokensOut)
        VIRTUAL.approve(address(bc), deposit);
        bc.buy(deposit, 0);

        agents.push(bc);
        emit AgentCreated(address(bc), msg.sender, name, symbol);
        return address(bc);
    }

    function allAgents() external view returns (BondingCurve[] memory) {
        return agents;
    }
}
