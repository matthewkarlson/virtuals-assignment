// Contract addresses from deployment
export const CONTRACTS = {
  EASYV: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  AGENT_FACTORY: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  BONDING_CURVE_IMPL: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
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
    "event Buy(address indexed buyer, uint256 virtualIn, uint256 tokensOut)",
    "event Graduate(address externalToken)",
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