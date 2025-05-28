import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";
import EasyVModule from "./EasyV";
import AgentFactoryModule from "./AgentFactory";

export default buildModule("FullDeployment", (m) => {
  const { easyv } = m.useModule(EasyVModule);
  const { agentFactory } = m.useModule(AgentFactoryModule);

  // Optional: Create a sample agent for testing
  // This would require the deployer to have enough EasyV tokens
  // Uncomment the lines below if you want to create a test agent during deployment
  
  /*
  const sampleAgentTx = m.call(agentFactory, "createAgent", [
    "Sample Agent",
    "SAMPLE",
    ethers.parseEther("6000") // MIN_INITIAL_DEPOSIT
  ], {
    after: [agentFactory]
  });
  */

  return { 
    easyv, 
    agentFactory,
    // sampleAgentTx 
  };
}); 