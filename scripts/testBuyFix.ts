import { ethers } from "hardhat";

async function main() {
  console.log("🧪 Testing fixed buy functionality...");

  // Use the newest deployment addresses
  const EASYV_ADDRESS = "0x439c09706D52e577B036E67b63308C7f218d2b22";
  const AGENT_FACTORY_ADDRESS = "0x2948dcd1B5537E3C0a596716b908AE23ab06CDa9";
  const BONDING_ADDRESS = "0x5c381F8Fb58622beD71119dEA591e7aeF5Bc52F0";

  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);

  // Gas settings
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

  console.log("\n🚀 Step 1: Launching a token...");
  try {
    const launchAmount = ethers.parseEther("200");
    await easyV.approve(AGENT_FACTORY_ADDRESS, launchAmount, gasSettings);
    console.log("✅ Approved AgentFactory");

    const tx = await agentFactory.launch(
      "TestBuy",
      "TBUY",
      launchAmount,
      gasSettings
    );
    
    const receipt = await tx.wait();
    if (receipt) {
      console.log("✅ Token launched successfully!");
      console.log("Gas used:", receipt.gasUsed.toString());
      
      // Get the launched token address
      const allTokens = await agentFactory.allBondingCurves();
      const tokenAddress = allTokens[allTokens.length - 1]; // Get the latest token
      console.log("Token address:", tokenAddress);
      
      console.log("\n💰 Step 2: Testing buy functionality...");
      
      // Try to buy some tokens
      const buyAmount = ethers.parseEther("100");
      
      // Approve Bonding contract to spend VIRTUAL
      await easyV.approve(BONDING_ADDRESS, buyAmount, gasSettings);
      console.log("✅ Approved Bonding contract for buy");
      
      // Buy tokens
      const buyTx = await bonding.buy(
        buyAmount,
        tokenAddress, 
        0, // minAmountOut
        Math.floor(Date.now() / 1000) + 300, // deadline
        gasSettings
      );
      
      const buyReceipt = await buyTx.wait();
      if (buyReceipt) {
        console.log("✅ Token purchase successful!");
        console.log("Gas used:", buyReceipt.gasUsed.toString());
        
        // Check token balance
        const tokenContract = await ethers.getContractAt("FERC20", tokenAddress);
        const tokenBalance = await tokenContract.balanceOf(deployer.address);
        console.log("Token balance received:", ethers.formatEther(tokenBalance));
      }
    }
    
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    
    if (error.message.includes("ERC20InsufficientAllowance")) {
      console.log("🔍 Still getting allowance error - need to investigate further");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 