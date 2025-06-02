import { ethers } from "hardhat";

async function main() {
  console.log("🧪 Testing Bonding contract directly (no AgentFactory)...");

  // Use the newest deployment addresses with fixed FERC20 constructor
  const EASYV_ADDRESS = "0x301247E4955C4Adb4462Ee2863fC984e6Bae5527";
  const BONDING_ADDRESS = "0x4102bEe2a486279e422b83f89231fcfB080DEFC4";

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
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);

  // Check balance
  const balance = await easyV.balanceOf(deployer.address);
  console.log("EasyV balance:", ethers.formatEther(balance));

  // Use the exact same parameters as the working test
  const launchAmount = ethers.parseEther("200");
  console.log("Launch amount:", ethers.formatEther(launchAmount));

  // Test direct bonding only - no AgentFactory
  console.log("\n🧪 Testing direct Bonding contract...");
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
      
      // Get token info
      const tokenCount = await bonding.tokenInfos.length;
      if (tokenCount > 0) {
        const tokenAddress = await bonding.tokenInfos(0);
        const tokenInfo = await bonding.tokenInfo(tokenAddress);
        console.log("Token created:", tokenInfo.token);
        console.log("Pair address:", tokenInfo.pair);
      }
    }
    
  } catch (error: any) {
    console.error("❌ Direct Bonding launch failed:", error.message);
    
    // Check if it's a specific type of error
    if (error.message.includes("panic code 0x11")) {
      console.log("🔍 Arithmetic overflow error detected");
    } else if (error.message.includes("panic code 0x12")) {
      console.log("🔍 Division by zero error detected");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 