// Contract addresses from deployment
export const CONTRACTS = {
  EASYV: "0x43F48c3DC6df4674219923F2d4f8880d5E3CCC4c",
  AGENT_FACTORY: "0x512F94E0a875516da53e2e59aC1995d6B2fbF781",
  BONDING_CURVE_IMPL: "0x292E27B2b439Bb485265aBA27c131247B13593c1",
  // Uniswap V2 Router (for local testing - this would be different on mainnet)
  UNISWAP_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
} as const;

// Contract addresses - these will be set after deployment
export const CONTRACT_ADDRESSES = {
  EasyV: process.env.NEXT_PUBLIC_EASYV_ADDRESS || "0x43F48c3DC6df4674219923F2d4f8880d5E3CCC4c",
  AgentFactory: process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS || "0x512F94E0a875516da53e2e59aC1995d6B2fbF781",
} as const;

// Import TypeChain generated types
export type {
  EasyV,
  AgentFactory,
  BondingCurve,
  AgentTokenExternal,
  AgentTokenInternal,
} from "../../../typechain-types";

// Import contract ABIs from local copies
import EasyVArtifact from "./abis/EasyV.json";
import AgentFactoryArtifact from "./abis/AgentFactory.json";
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