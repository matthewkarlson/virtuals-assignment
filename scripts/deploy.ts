import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Starting deployment...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  console.log("\n📋 Deployment Summary:");
  console.log("1. EasyV token will be deployed with 1B initial supply");
  console.log("2. AgentFactory will be deployed with EasyV as payment token");
  console.log("3. Minimum deposit for creating agents: 6,000 EasyV");
  console.log("4. Graduation threshold for agents: 42,000 EasyV");
  
  console.log("\n💡 After deployment, you can:");
  console.log("- Create agents using AgentFactory.createAgent()");
  console.log("- Buy tokens on bonding curves using BondingCurve.buy()");
  console.log("- Redeem external tokens after graduation using BondingCurve.redeem()");
  
  console.log("\n🔧 To deploy, run:");
  console.log("npx hardhat ignition deploy ignition/modules/FullDeployment.ts --network <network>");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 