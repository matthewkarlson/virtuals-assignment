import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";
import EasyVModule from "./EasyV";
import AgentFactoryModule from "./AgentFactory";
import BondingCurveImplementationModule from "./BondingCurveImplementation";

export default buildModule("FullDeploymentWithUniswap", (m) => {
  const { easyv } = m.useModule(EasyVModule);
  const { agentFactory } = m.useModule(AgentFactoryModule);
  const { bondingCurveImpl } = m.useModule(BondingCurveImplementationModule);

  // Uniswap V2 Router address (mainnet: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D)
  // For local testing, you'll need to deploy Uniswap V2 or use a testnet address
  const uniswapRouter = m.getParameter("uniswapRouter", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");

  // Set the bonding curve implementation in the factory
  const setBondingCurveImpl = m.call(agentFactory, "setBondingCurveImplementation", [bondingCurveImpl], {
    after: [agentFactory, bondingCurveImpl]
  });

  // Set the Uniswap router in the factory
  const setUniswapRouter = m.call(agentFactory, "setUniswapRouter", [uniswapRouter], {
    after: [setBondingCurveImpl]
  });

  // Optional: Create a sample agent for testing
  // This would require the deployer to have enough EasyV tokens
  // Uncomment the lines below if you want to create a test agent during deployment
  
  /*
  const createSampleAgent = m.call(agentFactory, "createAgent", [
    "Sample Agent",
    "SAMPLE",
    ethers.parseEther("6000") // MIN_INITIAL_DEPOSIT
  ], {
    after: [setUniswapRouter]
  });
  */

  return { 
    easyv, 
    agentFactory,
    bondingCurveImpl
  };
}); 