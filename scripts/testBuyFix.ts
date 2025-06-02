import { ethers } from "hardhat";

async function main() {
  console.log("🧪 Testing simplified Bonding-only approach...");

  // Use the newest deployment addresses (Bonding contract only)
  const EASYV_ADDRESS = "0x439c09706D52e577B036E67b63308C7f218d2b22";
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
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);

  // Launch a token directly
  const purchaseAmount = ethers.parseEther("6000");
  
  console.log("\n💰 Checking VIRTUAL balance...");
  const balance = await easyV.balanceOf(deployer.address);
  console.log("VIRTUAL balance:", ethers.formatEther(balance));
  
  if (balance < purchaseAmount) {
    console.log("❌ Insufficient VIRTUAL balance");
    return;
  }

  console.log("\n🎯 Launching token directly through Bonding...");
  const approveTx = await easyV.approve(BONDING_ADDRESS, purchaseAmount, gasSettings);
  await approveTx.wait();

  const launchTx = await bonding.launch(
    "TestToken",
    "TEST",
    [1], // cores
    "A test token", // description
    "", // image
    ["", "", "", ""], // urls
    purchaseAmount,
    gasSettings
  );
  const receipt = await launchTx.wait();

  if (receipt) {
    console.log("✅ Direct Bonding.launch() successful!");
    console.log("Gas used:", receipt.gasUsed.toString());

    // Test the FFactory approach to get tokens
    console.log("\n📊 Testing FFactory token discovery...");
    const factoryAddress = await bonding.factory();
    const factory = await ethers.getContractAt("FFactory", factoryAddress);
    
    const pairCount = await factory.allPairsLength();
    console.log("Total pairs in factory:", pairCount.toString());
    
    if (pairCount > 0) {
      const pairAddress = await factory.pairs(0);
      console.log("First pair address:", pairAddress);
      
      const pair = await ethers.getContractAt("FPair", pairAddress);
      const tokenA = await pair.tokenA();
      const tokenB = await pair.tokenB();
      
      console.log("Pair tokens:", tokenA, tokenB);
      
      // Find which one is not VIRTUAL
      const tokenAddress = tokenA.toLowerCase() === EASYV_ADDRESS.toLowerCase() ? tokenB : tokenA;
      console.log("Launched token address:", tokenAddress);
      
      // Get token info
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      console.log("Token info trading status:", tokenInfo.trading);
      console.log("Token info tradingOnUniswap:", tokenInfo.tradingOnUniswap);
      
      // Test buying to trigger graduation
      console.log("\n🚀 Testing graduation by buying large amount...");
      const gradThreshold = await bonding.gradThreshold();
      console.log("Graduation threshold:", ethers.formatEther(gradThreshold));
      
      // Get current reserves to see how much we need to buy
      const reserves = await pair.getReserves();
      const currentVirtualReserves = reserves[1]; // tokenB should be VIRTUAL
      console.log("Current VIRTUAL reserves:", ethers.formatEther(currentVirtualReserves));
      
      // Calculate how much we need to buy to get reserves below threshold
      const needToDrain = currentVirtualReserves - gradThreshold;
      const buyAmount = needToDrain + ethers.parseEther("1000"); // Buy a bit more to ensure graduation
      console.log("Need to drain:", ethers.formatEther(needToDrain), "VIRTUAL");
      console.log("Will buy:", ethers.formatEther(buyAmount), "VIRTUAL");
      
      try {
        await easyV.approve(BONDING_ADDRESS, buyAmount, gasSettings);
        
        const buyTx = await bonding.buy(
          buyAmount,
          tokenAddress,
          0, // min amount out
          Math.floor(Date.now() / 1000) + 300, // deadline
          gasSettings
        );
        
        const buyReceipt = await buyTx.wait();
        if (buyReceipt) {
          console.log("✅ Large buy successful! Gas used:", buyReceipt.gasUsed.toString());
          
          // Check if token graduated
          const updatedTokenInfo = await bonding.tokenInfo(tokenAddress);
          console.log("After buy - trading:", updatedTokenInfo.trading);
          console.log("After buy - tradingOnUniswap:", updatedTokenInfo.tradingOnUniswap);
          
          // Check final reserves
          const finalReserves = await pair.getReserves();
          console.log("Final VIRTUAL reserves:", ethers.formatEther(finalReserves[1]));
          
          if (!updatedTokenInfo.trading && updatedTokenInfo.tradingOnUniswap) {
            console.log("🎉 TOKEN GRADUATED! Now trading on Uniswap!");
          } else {
            console.log("Token has not graduated yet, reserves might still be above threshold");
          }
        }
        
      } catch (error: any) {
        console.log("Large buy failed:", error.message);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 