// Contract addresses from deployment
export const CONTRACTS = {
  EASYV: "0x244dE6b06E7087110b94Cde88A42d9aBA17efa52",
  AGENT_FACTORY: "0xa7E99C1df635d13d61F7c81eCe571cc952E64526",
  BONDING_CONTRACT: "0x07b3419cA340DdB3D813C5e6eCeA5C1085EFC1f2",
  // Uniswap V2 Router (for local testing - this would be different on mainnet)
  UNISWAP_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
} as const;

// Contract addresses - these will be set after deployment
export const CONTRACT_ADDRESSES = {
  EasyV: process.env.NEXT_PUBLIC_EASYV_ADDRESS || "0x244dE6b06E7087110b94Cde88A42d9aBA17efa52",
  AgentFactory: process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS || "0xa7E99C1df635d13d61F7c81eCe571cc952E64526",
  BondingContract: process.env.NEXT_PUBLIC_BONDING_ADDRESS || "0x07b3419cA340DdB3D813C5e6eCeA5C1085EFC1f2",
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
import FFactoryArtifact from "./abis/FFactory.json";
import FPairArtifact from "./abis/FPair.json";
import FRouterArtifact from "./abis/FRouter.json";
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
  FFactory: FFactoryArtifact.abi,
  FPair: FPairArtifact.abi,
  FRouter: FRouterArtifact.abi,
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