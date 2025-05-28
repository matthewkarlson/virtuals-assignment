// Contract addresses from deployment
export const CONTRACTS = {
  EASYV: "0x43f48c3dc6df4674219923f2d4f8880d5e3ccc4c",
  AGENT_FACTORY: "0x512f94e0a875516da53e2e59ac1995d6b2fbf781",
  BONDING_CURVE_IMPL: "0x292e27b2b439bb485265aba27c131247b13593c1",
} as const;

// Contract addresses - these will be set after deployment
export const CONTRACT_ADDRESSES = {
  EasyV: process.env.NEXT_PUBLIC_EASYV_ADDRESS || "0x43f48c3dc6df4674219923f2d4f8880d5e3ccc4c",
  AgentFactory: process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS || "0x512f94e0a875516da53e2e59ac1995d6b2fbf781",
} as const;

// Simplified ABIs for the frontend
export const ABIS = {
  EasyV: [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ],
  AgentFactory: [
    "function createAgent(string name, string symbol, uint256 deposit) returns (address)",
    "function allAgents() view returns (address[])",
    "function agentCount() view returns (uint256)",
    "function MIN_INITIAL_DEPOSIT() view returns (uint256)",
    "function GRAD_THRESHOLD() view returns (uint256)",
    "function uniswapRouter() view returns (address)",
    "event AgentCreated(address indexed curve, address indexed creator, string name, string symbol)",
  ],
  BondingCurve: [
    "function buy(uint256 virtualIn, uint256 minTokensOut) returns (uint256)",
    "function redeem(uint256 amount)",
    "function tokensSold() view returns (uint256)",
    "function virtualRaised() view returns (uint256)",
    "function graduated() view returns (bool)",
    "function GRADUATION_THRESHOLD() view returns (uint256)",
    "function creator() view returns (address)",
    "function iToken() view returns (address)",
    "function eToken() view returns (address)",
    "function uniswapPair() view returns (address)",
    "function uniswapRouter() view returns (address)",
    "event Buy(address indexed buyer, uint256 virtualIn, uint256 tokensOut)",
    "event Graduate(address externalToken, address uniswapPair, uint256 liquidityTokens)",
    "event Redeem(address indexed user, uint256 amount)",
  ],
  AgentToken: [
    "function balanceOf(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ],
} as const;

// Network configuration
export const NETWORK_CONFIG = {
  chainId: 31337, // Hardhat local network
  name: "Hardhat Local Network",
  rpcUrl: "http://localhost:8545",
} as const; 