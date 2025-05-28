import { ethers } from "ethers";
import { CONTRACT_ADDRESSES } from "./contracts";
import type {
  EasyV,
  AgentFactory,
  BondingCurve,
  AgentTokenExternal,
  AgentTokenInternal,
} from "./contracts";

// Import TypeChain factories
import {
  EasyV__factory,
  AgentFactory__factory,
  BondingCurve__factory,
  AgentTokenExternal__factory,
  AgentTokenInternal__factory,
} from "../../../typechain-types";

/**
 * Type-safe contract factory functions using TypeChain generated types
 * These provide full TypeScript intellisense and type checking
 */

export function getEasyVContract(
  signerOrProvider: ethers.Signer | ethers.Provider
): EasyV {
  return EasyV__factory.connect(CONTRACT_ADDRESSES.EasyV, signerOrProvider);
}

export function getAgentFactoryContract(
  signerOrProvider: ethers.Signer | ethers.Provider
): AgentFactory {
  return AgentFactory__factory.connect(CONTRACT_ADDRESSES.AgentFactory, signerOrProvider);
}

export function getBondingCurveContract(
  address: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): BondingCurve {
  return BondingCurve__factory.connect(address, signerOrProvider);
}

export function getAgentTokenExternalContract(
  address: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): AgentTokenExternal {
  return AgentTokenExternal__factory.connect(address, signerOrProvider);
}

export function getAgentTokenInternalContract(
  address: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): AgentTokenInternal {
  return AgentTokenInternal__factory.connect(address, signerOrProvider);
}

/**
 * Example usage with full type safety:
 * 
 * const provider = new ethers.JsonRpcProvider("http://localhost:8545");
 * const agentFactory = getAgentFactoryContract(provider);
 * 
 * // TypeScript will provide autocomplete and type checking for all methods
 * const minDeposit = await agentFactory.MIN_INITIAL_DEPOSIT();
 * const agentCount = await agentFactory.agentCount();
 * 
 * // Function parameters are type-checked
 * const tx = await agentFactory.createAgent("MyAgent", "MA", minDeposit);
 * 
 * // Events are also typed
 * agentFactory.on("AgentCreated", (curve, creator, name, symbol) => {
 *   // All parameters are properly typed
 *   console.log(`Agent ${name} (${symbol}) created at ${curve}`);
 * });
 */ 