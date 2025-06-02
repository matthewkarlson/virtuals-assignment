import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import AgentFactoryModule from "./AgentFactory";
import FunSystemModule from "./FunSystemDeployment";

export default buildModule("FullDeployment", (m) => {
  const virtualTokenAddress = m.getParameter("virtualTokenAddress", "0x0e4aaF1351de4c0264C5c7056Ef3777b41BD8e03");
  const feeTo = m.getParameter("feeTo", "0x0000000000000000000000000000000000000000");

  // Deploy fun system contracts (not initialized yet)
  const { fFactory, fRouter, bonding } = m.useModule(FunSystemModule);
  
  // Deploy AgentFactory
  const { agentFactory } = m.useModule(AgentFactoryModule);

  // Initialize FFactory
  const initFactory = m.call(fFactory, "initialize", [feeTo, 500, 500], {
    after: [fFactory]
  });

  // Initialize FRouter
  const initRouter = m.call(fRouter, "initialize", [fFactory, virtualTokenAddress], {
    after: [fRouter, initFactory]
  });

  // Set router in factory
  const setRouter = m.call(fFactory, "setRouter", [fRouter], {
    after: [initRouter]
  });

  // Grant CREATOR_ROLE to bonding contract in factory
  const creatorRole = m.staticCall(fFactory, "CREATOR_ROLE");
  const grantCreatorRole = m.call(fFactory, "grantRole", [creatorRole, bonding], {
    after: [setRouter]
  });

  // Grant EXECUTOR_ROLE to bonding contract in router
  const executorRole = m.staticCall(fRouter, "EXECUTOR_ROLE");
  const grantExecutorRole = m.call(fRouter, "grantRole", [executorRole, bonding], {
    after: [setRouter]
  });

  // Initialize Bonding contract with AgentFactory
  const initBonding = m.call(bonding, "initialize", [
    fFactory,
    fRouter,
    feeTo,
    500, // fee (0.5%)
    "1000000000000000000000000000", // initialSupply (1B tokens)
    1000, // assetRate
    5, // maxTx (5%)
    agentFactory, // agentFactory
    "42000000000000000000000" // gradThreshold (42k VIRTUAL)
  ], {
    after: [grantCreatorRole, grantExecutorRole, agentFactory]
  });

  // Set bonding contract in AgentFactory
  const setBondingContract = m.call(agentFactory, "setBondingContract", [bonding], {
    after: [initBonding]
  });

  return {
    fFactory,
    fRouter,
    bonding,
    agentFactory
  };
}); 