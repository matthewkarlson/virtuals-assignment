import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("🧪 Testing token graduation for frontend...");
  
  const [deployer, creator, buyer] = await ethers.getSigners();
  
  // Contract addresses from deployment
  const EASYV_ADDRESS = "0x292E27B2b439Bb485265aBA27c131247B13593c1";
  const BONDING_ADDRESS = "0x0454a4798602babb16529F49920E8B2f4a747Bb2";
  
  // Get contracts
  const virtual = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);
  
  console.log("📋 Contract addresses:");
  console.log(`EasyV: ${EASYV_ADDRESS}`);
  console.log(`Bonding: ${BONDING_ADDRESS}`);
  
  // Give creator some tokens
  const creatorAmount = ethers.parseEther("1000");
  await virtual.transfer(creator.address, creatorAmount);
  console.log(`💰 Transferred ${ethers.formatEther(creatorAmount)} VIRTUAL to creator`);
  
  // Give buyer lots of tokens for graduation
  const buyerAmount = ethers.parseEther("100000");
  await virtual.transfer(buyer.address, buyerAmount);
  console.log(`💰 Transferred ${ethers.formatEther(buyerAmount)} VIRTUAL to buyer`);
  
  // Launch a token
  const launchAmount = ethers.parseEther("200");
  await virtual.connect(creator).approve(BONDING_ADDRESS, launchAmount);
  
  console.log("🚀 Launching test token...");
  const tx = await bonding.connect(creator).launch(
    "Test Cat",
    "TCAT",
    [0, 1, 2],
    "A test cat token for graduation testing",
    "https://example.com/cat.png",
    ["@testcat", "t.me/testcat", "", "testcat.com"],
    launchAmount
  );
  
  const receipt = await tx.wait();
  
  // Get token address from event
  const launchedEvent = receipt?.logs.find(log => {
    try {
      const parsed = bonding.interface.parseLog(log);
      return parsed?.name === "Launched";
    } catch {
      return false;
    }
  });
  
  if (!launchedEvent) {
    throw new Error("Launch event not found");
  }
  
  const parsedEvent = bonding.interface.parseLog(launchedEvent);
  const tokenAddress = parsedEvent?.args[0];
  
  console.log(`✅ Token launched: ${tokenAddress}`);
  
  // Check initial state
  const tokenInfo = await bonding.tokenInfo(tokenAddress);
  console.log(`📊 Initial state: trading=${tokenInfo.trading}, tradingOnUniswap=${tokenInfo.tradingOnUniswap}`);
  
  // Buy enough to trigger graduation
  const buyAmount = ethers.parseEther("35000");
  await virtual.connect(buyer).approve(BONDING_ADDRESS, buyAmount);
  
  console.log("🎓 Triggering graduation...");
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const buyTx = await bonding.connect(buyer).buy(buyAmount, tokenAddress, 0, deadline);
  const buyReceipt = await buyTx.wait();
  
  // Check for graduation event
  const graduatedEvent = buyReceipt?.logs.find(log => {
    try {
      const parsed = bonding.interface.parseLog(log);
      return parsed?.name === "Graduated";
    } catch {
      return false;
    }
  });
  
  if (graduatedEvent) {
    console.log("🎉 Graduation successful!");
    
    // Check final state
    const finalTokenInfo = await bonding.tokenInfo(tokenAddress);
    console.log(`📊 Final state: trading=${finalTokenInfo.trading}, tradingOnUniswap=${finalTokenInfo.tradingOnUniswap}`);
    console.log(`🦄 Uniswap pair: ${finalTokenInfo.uniswapPair}`);
    
    // Check graduated tokens array
    const graduatedToken = await bonding.graduatedTokens(0);
    console.log(`📋 Graduated token in array: ${graduatedToken}`);
    
    console.log("\n✅ Test completed successfully!");
    console.log("🌐 You can now test the frontend at http://localhost:3000/graduated");
  } else {
    console.log("❌ Graduation did not occur");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 