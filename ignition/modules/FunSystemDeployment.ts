import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FunSystemDeployment", (m) => {
  // Parameters for the fun system
  const virtualTokenAddress = m.getParameter("virtualTokenAddress", "0x0e4aaF1351de4c0264C5c7056Ef3777b41BD8e03");
  const feeTo = m.getParameter("feeTo", "0x0000000000000000000000000000000000000000");
  const fee = m.getParameter("fee", 500); // 0.5%
  const initialSupply = m.getParameter("initialSupply", "1000000000000000000000000000"); // 1B tokens
  const assetRate = m.getParameter("assetRate", 1000);
  const maxTx = m.getParameter("maxTx", 5);
  const gradThreshold = m.getParameter("gradThreshold", "42000000000000000000000"); // 42k VIRTUAL

  // Deploy FFactory
  const fFactory = m.contract("FFactory", [], {});

  // Deploy FRouter  
  const fRouter = m.contract("FRouter", [], {});

  // Deploy Bonding contract (not initialized yet)
  const bonding = m.contract("Bonding", [], {});

  return {
    fFactory,
    fRouter,
    bonding
  };
}); 