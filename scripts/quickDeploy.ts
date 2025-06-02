import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("🚀 Quick deployment starting...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Gas settings to overcome fee issues
  const gasSettings = {
    maxFeePerGas: ethers.parseUnits("20", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    gasLimit: 30000000
  };

  // Deploy EasyV token with initial supply (non-upgradeable)
  console.log("\n📦 Deploying EasyV token...");
  const EasyV = await ethers.getContractFactory("EasyV");
  const initialSupply = ethers.parseEther("1000000000"); // 1B tokens
  const easyV = await EasyV.deploy(initialSupply, gasSettings);
  await easyV.waitForDeployment();
  const easyVAddress = await easyV.getAddress();
  console.log("✅ EasyV deployed to:", easyVAddress);

  // Deploy AgentFactory (non-upgradeable)
  console.log("\n📦 Deploying AgentFactory...");
  const AgentFactory = await ethers.getContractFactory("AgentFactory");
  const agentFactory = await AgentFactory.deploy(easyVAddress, gasSettings);
  await agentFactory.waitForDeployment();
  const agentFactoryAddress = await agentFactory.getAddress();
  console.log("✅ AgentFactory deployed to:", agentFactoryAddress);

  // Deploy upgradeable contracts using proxies
  console.log("\n📦 Deploying FFactory (upgradeable)...");
  const FFactory = await ethers.getContractFactory("FFactory");
  const fFactory = await upgrades.deployProxy(FFactory, [
    deployer.address, // taxVault
    0, // buyTax (0%)
    0  // sellTax (0%)
  ], { 
    initializer: 'initialize',
    kind: 'transparent',
    txOverrides: gasSettings
  });
  await fFactory.waitForDeployment();
  const fFactoryAddress = await fFactory.getAddress();
  console.log("✅ FFactory proxy deployed to:", fFactoryAddress);

  console.log("\n📦 Deploying FRouter (upgradeable)...");
  const FRouter = await ethers.getContractFactory("FRouter");
  const fRouter = await upgrades.deployProxy(FRouter, [
    fFactoryAddress,
    easyVAddress
  ], { 
    initializer: 'initialize',
    kind: 'transparent',
    txOverrides: gasSettings
  });
  await fRouter.waitForDeployment();
  const fRouterAddress = await fRouter.getAddress();
  console.log("✅ FRouter proxy deployed to:", fRouterAddress);

  console.log("\n📦 Deploying Bonding (upgradeable)...");
  const Bonding = await ethers.getContractFactory("Bonding");
  
  // Bonding initialization parameters (matching the working test exactly)
  const fee = 100000; // 100000 / 1000 = 100 ether fee (matches test)
  const tokenInitialSupply = ethers.parseEther("1000000000"); // 1B tokens with proper 18 decimals
  const assetRate = 10000; // 100% (matches test)
  const maxTx = 100; // Just 100 (matches test)
  const gradThreshold = ethers.parseEther("42000"); // Much smaller threshold - 42k ether
  
  const bonding = await upgrades.deployProxy(Bonding, [
    fFactoryAddress,
    fRouterAddress,
    deployer.address, // feeTo
    fee,
    tokenInitialSupply,
    assetRate,
    maxTx,
    agentFactoryAddress,
    gradThreshold
  ], { 
    initializer: 'initialize',
    kind: 'transparent',
    txOverrides: gasSettings
  });
  await bonding.waitForDeployment();
  const bondingAddress = await bonding.getAddress();
  console.log("✅ Bonding proxy deployed to:", bondingAddress);

  // Post-deployment configuration
  console.log("\n🔧 Configuring contracts...");
  
  // Grant admin roles to deployer for configuration
  const ADMIN_ROLE = await fFactory.ADMIN_ROLE();
  await fFactory.grantRole(ADMIN_ROLE, deployer.address, gasSettings);
  console.log("✅ Admin role granted to deployer for FFactory");
  
  const ROUTER_ADMIN_ROLE = await fRouter.ADMIN_ROLE();
  await fRouter.grantRole(ROUTER_ADMIN_ROLE, deployer.address, gasSettings);
  console.log("✅ Admin role granted to deployer for FRouter");
  
  // Set bonding contract in AgentFactory
  await agentFactory.setBondingContract(bondingAddress, gasSettings);
  console.log("✅ AgentFactory bonding contract set");

  // Set router in FFactory
  await fFactory.setRouter(fRouterAddress, gasSettings);
  console.log("✅ FFactory router set");

  // Grant creator role to bonding contract
  const CREATOR_ROLE = await fFactory.CREATOR_ROLE();
  await fFactory.grantRole(CREATOR_ROLE, bondingAddress, gasSettings);
  console.log("✅ Creator role granted to Bonding contract");

  // Grant executor role to bonding contract in router
  const EXECUTOR_ROLE = await fRouter.EXECUTOR_ROLE();
  await fRouter.grantRole(EXECUTOR_ROLE, bondingAddress, gasSettings);
  console.log("✅ Executor role granted to Bonding contract in router");

  console.log("\n🎉 Deployment Summary:");
  console.log("=====================================");
  console.log("EasyV:", easyVAddress);
  console.log("AgentFactory:", agentFactoryAddress);
  console.log("FFactory:", fFactoryAddress);
  console.log("FRouter:", fRouterAddress);
  console.log("Bonding:", bondingAddress);
  console.log("=====================================");
  
  console.log("\n📝 Update your UI contracts.ts file with these addresses:");
  console.log(`EASYV: "${easyVAddress}",`);
  console.log(`AGENT_FACTORY: "${agentFactoryAddress}",`);
  console.log(`BONDING_CONTRACT: "${bondingAddress}",`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 