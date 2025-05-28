// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable}              from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentTokenInternal
 * @notice Minimal ERC‑20 used **during** the bonding‑curve phase. Entire supply
 *         is minted to the BondingCurve contract. When the curve graduates, the
 *         holder can burn their internal tokens via `BondingCurve.redeem()` and
 *         receive external tokens 1 : 1.
 */
contract AgentTokenInternal is ERC20Burnable, Ownable {
    constructor(
        string  memory name_,
        string  memory symbol_,
        address owner_,
        uint256 supply_
    )
        ERC20(name_, symbol_)   // pass ERC‑20 metadata
        Ownable(owner_)        // set initial owner explicitly (OZ ≥5.0 requirement)
    {
        _mint(owner_, supply_);
    }
}