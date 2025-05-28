import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import EasyVModule from "./EasyV";

export default buildModule("AgentFactory", (m) => {
  const { easyv } = m.useModule(EasyVModule);

  const agentFactory = m.contract("AgentFactory", [easyv], {});

  return { agentFactory };
}); 