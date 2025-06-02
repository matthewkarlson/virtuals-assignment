import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Debugging Bonding contract execution...");

  // Use the new deployment addresses
  const EASYV_ADDRESS = "0x3AD4869afcC42f5Ad199914d398b3172c576f413";
  const BONDING_ADDRESS = "0xBAd33687bF083AcC7D5114406fa2Ea77c1363385";
  const FFACTORY_ADDRESS = "0xD8d69B943eD9bA56A433375703C0cCa3f53C8678";
  const FROUTER_ADDRESS = "0x1360963C6c5E707CAFA724078d26034FB8554c7A";

  const [deployer] = await ethers.getSigners();
  console.log("Debugging with account:", deployer.address);

  // Gas settings
  const gasSettings = {
    maxFeePerGas: ethers.parseUnits("20", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    gasLimit: 30000000
  };

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);
  const fFactory = await ethers.getContractAt("FFactory", FFACTORY_ADDRESS);
  const fRouter = await ethers.getContractAt("FRouter", FROUTER_ADDRESS);

  console.log("\n📊 Contract Parameters:");
  console.log("=====================================");
  
  // Check Bonding parameters
  const initialSupply = await bonding.initialSupply();
  const fee = await bonding.fee();
  const assetRate = await bonding.assetRate();
  const maxTx = await bonding.maxTx();
  const gradThreshold = await bonding.gradThreshold();
  const K = await bonding.K();
  
  console.log("Bonding.initialSupply:", ethers.formatEther(initialSupply));
  console.log("Bonding.fee:", ethers.formatEther(fee));
  console.log("Bonding.assetRate:", assetRate.toString());
  console.log("Bonding.maxTx:", maxTx.toString());
  console.log("Bonding.gradThreshold:", ethers.formatEther(gradThreshold));
  console.log("Bonding.K:", K.toString());
  
  // Check router asset token
  const assetToken = await fRouter.assetToken();
  console.log("FRouter.assetToken:", assetToken);
  console.log("EasyV address:", EASYV_ADDRESS);
  console.log("Asset token matches EasyV:", assetToken.toLowerCase() === EASYV_ADDRESS.toLowerCase());
  
  // Let's try to simulate the launch step by step
  console.log("\n🧪 Step-by-step Launch Simulation:");
  console.log("=====================================");
  
  const purchaseAmount = ethers.parseEther("200");
  const feeAmount = fee;
  const initialPurchase = purchaseAmount - feeAmount;
  
  console.log("1. Purchase amount:", ethers.formatEther(purchaseAmount));
  console.log("2. Fee amount:", ethers.formatEther(feeAmount));
  console.log("3. Initial purchase:", ethers.formatEther(initialPurchase));
  
  // Calculate expected FERC20 and liquidity values
  const ferc20Supply = initialSupply; // This should be the total supply after FERC20 multiplication
  const k = (K * 10000n) / assetRate;
  const liquidity = (((k * ethers.parseEther("10000")) / ferc20Supply) * ethers.parseEther("1")) / 10000n;
  
  console.log("4. Expected FERC20 total supply:", ethers.formatEther(ferc20Supply));
  console.log("5. Calculated k:", k.toString());
  console.log("6. Calculated liquidity:", ethers.formatEther(liquidity));
  
  // Now let's test what happens if we try to create a pair manually
  console.log("\n🔧 Testing Pair Creation Process:");
  console.log("=====================================");
  
  try {
    // Approve bonding contract
    await easyV.approve(BONDING_ADDRESS, purchaseAmount, gasSettings);
    console.log("✅ Approved Bonding contract");
    
    // Let's create a test FERC20 token to see the actual supply values
    console.log("\n🧮 Testing FERC20 Supply Calculation:");
    const FERC20 = await ethers.getContractFactory("FERC20");
    const testToken = await FERC20.deploy("Test Token", "TEST", initialSupply / ethers.parseEther("1"), 100);
    await testToken.waitForDeployment();
    
    const actualSupply = await testToken.totalSupply();
    console.log("- Input to FERC20 constructor:", ethers.formatEther(initialSupply / ethers.parseEther("1")));
    console.log("- Actual FERC20 total supply:", ethers.formatEther(actualSupply));
    
    // Calculate what the k value would be in the pair
    const pairK = actualSupply * liquidity;
    console.log("- Calculated pair k (supply * liquidity):", pairK.toString());
    console.log("- Pair k exceeds uint256 max?", pairK > (2n ** 256n - 1n));
    
    // Let's trace through the launch process manually
    console.log("\n📋 Starting launch process...");
    
    // Before launch - check current state
    const tokenCount = await bonding.tokenInfos.length;
    console.log("Current token count before launch:", tokenCount.toString());
    
    // Check what pair would be created
    const testTokenAddress = ethers.ZeroAddress; // Just for testing getPair
    const testPairAddress = await fFactory.getPair(testTokenAddress, assetToken);
    console.log("Test pair address (should be zero):", testPairAddress);
    
    // Now try the actual launch and see where it fails
    console.log("\n🚀 Attempting launch...");
    const tx = await bonding.launch(
      "TestToken",
      "TEST", 
      [0, 1, 2],
      "test token",
      "",
      ["", "", "", ""],
      purchaseAmount,
      gasSettings
    );
    
    const receipt = await tx.wait();
    if (receipt) {
      console.log("✅ Launch successful!");
      console.log("Gas used:", receipt.gasUsed.toString());
      
      // Check what was created
      const newTokenCount = await bonding.tokenInfos.length;
      console.log("New token count:", newTokenCount.toString());
      
      if (newTokenCount > 0) {
        const tokenAddress = await bonding.tokenInfos(0);
        const tokenInfo = await bonding.tokenInfo(tokenAddress);
        const pairAddr = await fFactory.getPair(tokenAddress, assetToken);
        
        console.log("Token created:", tokenInfo.token);
        console.log("Pair address:", pairAddr);
        
        if (pairAddr !== ethers.ZeroAddress) {
          const pair = await ethers.getContractAt("FPair", pairAddr);
          const reserves = await pair.getReserves();
          const kLast = await pair.kLast();
          const tokenBalance = await pair.balance();
          const assetBalance = await pair.assetBalance();
          
          console.log("Pair state:");
          console.log(`  Reserves: (${ethers.formatEther(reserves[0])}, ${ethers.formatEther(reserves[1])})`);
          console.log(`  K last: ${kLast.toString()}`);
          console.log(`  Token balance: ${ethers.formatEther(tokenBalance)}`);
          console.log(`  Asset balance: ${ethers.formatEther(assetBalance)}`);
        }
      }
    }
    
  } catch (error: any) {
    console.error("❌ Launch failed:", error.message);
    
    // Let's try to get more detailed error information
    if (error.message.includes("panic code 0x11")) {
      console.log("\n🔍 Arithmetic overflow detected. Let's analyze...");
      
      // Check if the issue might be in the FERC20 supply calculation
      console.log("Checking potential overflow sources:");
      console.log("- initialSupply / 1 ether =", ethers.formatEther(initialSupply / ethers.parseEther("1")));
      console.log("- k * 10000 ether =", ethers.formatEther(k * ethers.parseEther("10000")));
      
      // Check if this exceeds max uint256
      const maxUint256 = 2n ** 256n - 1n;
      const kTimes10000Ether = k * ethers.parseEther("10000");
      console.log("- Does k * 10000 ether exceed uint256 max?", kTimes10000Ether > maxUint256);
      console.log("- k * 10000 ether =", kTimes10000Ether.toString());
      console.log("- Max uint256 =", maxUint256.toString());
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 