// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20}   from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentTokenExternal
 * @notice Final freely‑tradable ERC‑20 minted once the agent graduates. Entire
 *         supply is initially held by the BondingCurve contract and released
 *         when users redeem their internal tokens.
 */
contract AgentTokenExternal is ERC20, Ownable {
    constructor(
        string  memory name_,
        string  memory symbol_,
        address owner_,
        uint256 supply_
    )
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        _mint(owner_, supply_);
    }
}
