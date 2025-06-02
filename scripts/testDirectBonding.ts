import { ethers } from "hardhat";

async function main() {
  console.log("🧪 Testing AgentFactory.launch() - Frontend Integration...");

  // Use the newest deployment addresses with AgentFactory launch methods
  const EASYV_ADDRESS = "0x956d3A0B3161f79E6809cc1313E8F32B0de73B70";
  const AGENT_FACTORY_ADDRESS = "0x72cdd30c3989D7f87bA563b0DA6ECcdd79fcdA9F";
  const BONDING_ADDRESS = "0xE6711c866D4ee72663521CB2ff8B72879b5f40D0";

  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);

  // Gas settings to match deployment
  const gasSettings = {
    maxFeePerGas: ethers.parseUnits("20", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    gasLimit: 30000000
  };

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);

  // Check balance
  const balance = await easyV.balanceOf(deployer.address);
  console.log("EasyV balance:", ethers.formatEther(balance));

  // Use the exact same parameters as the working test
  const launchAmount = ethers.parseEther("200");
  console.log("Launch amount:", ethers.formatEther(launchAmount));

  // Test AgentFactory.launch() method that the frontend calls
  console.log("\n🧪 Testing AgentFactory.launch() method...");
  try {
    await easyV.approve(AGENT_FACTORY_ADDRESS, launchAmount, gasSettings);
    console.log("✅ Approved AgentFactory");

    const tx = await agentFactory.launch(
      "Test",
      "TST",
      launchAmount,
      gasSettings
    );
    
    const receipt = await tx.wait();
    if (receipt) {
      console.log("✅ AgentFactory.launch() successful!");
      console.log("Gas used:", receipt.gasUsed.toString());
      
      // Check if token was created in bonding contract
      const tokenCount = await bonding.tokenInfos.length;
      console.log("Tokens created in bonding contract:", tokenCount.toString());
      
      // Check if token was tracked in AgentFactory
      const allTokens = await agentFactory.allBondingCurves();
      console.log("Tokens tracked in AgentFactory:", allTokens.length);
      console.log("Tracked token addresses:", allTokens);
      
      if (tokenCount > 0) {
        const tokenAddress = await bonding.tokenInfos(0);
        const tokenInfo = await bonding.tokenInfo(tokenAddress);
        console.log("Token created:", tokenInfo.token);
        console.log("Pair address:", tokenInfo.pair);
        console.log("Trading:", tokenInfo.trading);
      }
    }
    
  } catch (error: any) {
    console.error("❌ AgentFactory.launch() failed:", error.message);
    
    // Check if it's a specific type of error
    if (error.message.includes("panic code 0x11")) {
      console.log("🔍 Arithmetic overflow error detected");
    } else if (error.message.includes("panic code 0x12")) {
      console.log("🔍 Division by zero error detected");
    } else if (error.message.includes("require(false)")) {
      console.log("🔍 Require check failed - checking bonding contract setup");
      
      // Check if bonding contract is set
      const bondingContract = await agentFactory.bondingContract();
      console.log("Bonding contract set in AgentFactory:", bondingContract);
      console.log("Expected bonding contract:", BONDING_ADDRESS);
      console.log("Bonding contract matches:", bondingContract.toLowerCase() === BONDING_ADDRESS.toLowerCase());
    }
  }

  // Also test direct bonding for comparison
  console.log("\n🧪 Testing direct Bonding contract for comparison...");
  try {
    await easyV.approve(BONDING_ADDRESS, launchAmount, gasSettings);
    console.log("✅ Approved Bonding contract");

    const tx = await bonding.launch(
      "Dog",
      "$DOG", 
      [0, 1, 2],
      "it is a dog",
      "",
      ["", "", "", ""],
      launchAmount,
      gasSettings
    );
    
    const receipt = await tx.wait();
    if (receipt) {
      console.log("✅ Direct Bonding launch successful!");
      console.log("Gas used:", receipt.gasUsed.toString());
    }
    
  } catch (error: any) {
    console.error("❌ Direct Bonding launch failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 