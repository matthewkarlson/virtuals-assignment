// Contract addresses from deployment
export const CONTRACTS = {
  EASYV: "0x439c09706D52e577B036E67b63308C7f218d2b22",
  AGENT_FACTORY: "0x2948dcd1B5537E3C0a596716b908AE23ab06CDa9",
  BONDING_CONTRACT: "0x5c381F8Fb58622beD71119dEA591e7aeF5Bc52F0",
  // Uniswap V2 Router (for local testing - this would be different on mainnet)
  UNISWAP_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
} as const;

// Contract addresses - these will be set after deployment
export const CONTRACT_ADDRESSES = {
  EasyV: process.env.NEXT_PUBLIC_EASYV_ADDRESS || "0x439c09706D52e577B036E67b63308C7f218d2b22",
  AgentFactory: process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS || "0x2948dcd1B5537E3C0a596716b908AE23ab06CDa9",
  BondingContract: process.env.NEXT_PUBLIC_BONDING_ADDRESS || "0x5c381F8Fb58622beD71119dEA591e7aeF5Bc52F0",
} as const;

// Import TypeChain generated types - only import what exists
export type {
  EasyV,
  AgentFactory,
} from "../../../typechain-types";

// Import contract ABIs from local copies
import EasyVArtifact from "./abis/EasyV.json";
import AgentFactoryArtifact from "./abis/AgentFactory.json";
import BondingArtifact from "./abis/Bonding.json";
import FERC20Artifact from "./abis/FERC20.json";
import BondingCurveArtifact from "./abis/BondingCurve.json";
import AgentTokenExternalArtifact from "./abis/AgentTokenExternal.json";
import AgentTokenInternalArtifact from "./abis/AgentTokenInternal.json";
import IUniswapV2Router02Artifact from "./abis/IUniswapV2Router02.json";
import IUniswapV2PairArtifact from "./abis/IUniswapV2Pair.json";
import IUniswapV2FactoryArtifact from "./abis/IUniswapV2Factory.json";

// Export ABIs from artifacts (these are automatically generated and always up-to-date)
export const ABIS = {
  EasyV: EasyVArtifact.abi,
  AgentFactory: AgentFactoryArtifact.abi,
  Bonding: BondingArtifact.abi,
  FERC20: FERC20Artifact.abi,
  BondingCurve: BondingCurveArtifact.abi,
  AgentTokenExternal: AgentTokenExternalArtifact.abi,
  AgentTokenInternal: AgentTokenInternalArtifact.abi,
  IUniswapV2Router02: IUniswapV2Router02Artifact.abi,
  IUniswapV2Pair: IUniswapV2PairArtifact.abi,
  IUniswapV2Factory: IUniswapV2FactoryArtifact.abi,
} as const;

// Network configuration
export const NETWORK_CONFIG = {
  chainId: 31337, // Hardhat local network
  name: "Hardhat Local Network",
  rpcUrl: "http://localhost:8545",
} as const; 