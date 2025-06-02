import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Debugging token state...");

  const BONDING_ADDRESS = "0xE6711c866D4ee72663521CB2ff8B72879b5f40D0";
  const AGENT_FACTORY_ADDRESS = "0x72cdd30c3989D7f87bA563b0DA6ECcdd79fcdA9F";
  
  const [deployer] = await ethers.getSigners();
  
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);
  const router = await ethers.getContractAt("FRouter", await bonding.router());
  const factory = await ethers.getContractAt("FFactory", await bonding.factory());
  
  try {
    // Get a token address from AgentFactory
    const allTokens = await agentFactory.allBondingCurves();
    console.log("🎯 All tracked tokens:", allTokens.length);
    
    if (allTokens.length === 0) {
      console.log("❌ No tokens found in AgentFactory");
      return;
    }
    
    const TOKEN_ADDRESS = allTokens[0]; // Use the first token
    console.log("🪙 Testing token:", TOKEN_ADDRESS);
    
    // Get token info
    const tokenInfo = await bonding.tokenInfo(TOKEN_ADDRESS);
    console.log("📊 Token Info:");
    console.log("- Creator:", tokenInfo.creator);
    console.log("- Token:", tokenInfo.token);
    console.log("- Pair:", tokenInfo.pair);
    console.log("- Trading:", tokenInfo.trading);
    console.log("- Trading on Uniswap:", tokenInfo.tradingOnUniswap);
    
    // Check pair
    const pairAddress = await factory.getPair(TOKEN_ADDRESS, await router.assetToken());
    console.log("\n🔗 Pair Info:");
    console.log("- Pair from factory:", pairAddress);
    console.log("- Pair from token info:", tokenInfo.pair);
    console.log("- Pairs match:", pairAddress.toLowerCase() === tokenInfo.pair.toLowerCase());
    
    if (pairAddress !== ethers.ZeroAddress) {
      const pair = await ethers.getContractAt("FPair", pairAddress);
      const reserves = await pair.getReserves();
      console.log("- Reserve A:", ethers.formatEther(reserves[0]));
      console.log("- Reserve B:", ethers.formatEther(reserves[1]));
      console.log("- K Last:", ethers.formatEther(await pair.kLast()));
    }
    
    // Check router permissions
    console.log("\n🔑 Router Permissions:");
    const EXECUTOR_ROLE = await router.EXECUTOR_ROLE();
    const hasExecutorRole = await router.hasRole(EXECUTOR_ROLE, BONDING_ADDRESS);
    console.log("- Bonding has EXECUTOR_ROLE:", hasExecutorRole);
    
    // Try to estimate buy
    console.log("\n💰 Testing buy estimation:");
    const buyAmount = ethers.parseEther("100");
    try {
      const amountOut = await router.getAmountsOut(TOKEN_ADDRESS, await router.assetToken(), buyAmount);
      console.log("- Amount out:", ethers.formatEther(amountOut));
    } catch (error: any) {
      console.log("- Get amounts out failed:", error.message);
    }
    
  } catch (error: any) {
    console.error("❌ Debug failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 