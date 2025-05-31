import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";
import EasyVModule from "./EasyV";
import AgentFactoryModule from "./AgentFactory";
import BondingCurveImplementationModule from "./BondingCurveImplementation";

export default buildModule("FullDeployment", (m) => {
  const { easyv } = m.useModule(EasyVModule);
  const { agentFactory } = m.useModule(AgentFactoryModule);
  const { bondingCurveImpl } = m.useModule(BondingCurveImplementationModule);

  // Set the bonding curve implementation in the factory
  const setBondingCurveImpl = m.call(agentFactory, "setBondingCurveImplementation", [bondingCurveImpl], {
    after: [agentFactory, bondingCurveImpl]
  });

  // Optional: Create a sample agent for testing
  // This would require the deployer to have enough EasyV tokens
  // Uncomment the lines below if you want to create a test agent during deployment
  
  /*
  const createSampleAgent = m.call(agentFactory, "launch", [
    "Sample Agent",
    "SAMPLE", 
    [1, 2, 3], // cores array
    ethers.parseEther("6000") // MIN_INITIAL_DEPOSIT
  ], {
    after: [setBondingCurveImpl]
  });
  */

  return { 
    easyv, 
    agentFactory,
    bondingCurveImpl
  };
}); 