import { ethers } from "hardhat";

async function main() {
  console.log("🧪 Testing frontend data fetching logic...");
  
  const [deployer] = await ethers.getSigners();
  
  // Contract addresses
  const BONDING_ADDRESS = "0x0454a4798602babb16529F49920E8B2f4a747Bb2";
  const UNISWAP_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  
  // Get contracts
  const bonding = await ethers.getContractAt("Bonding", BONDING_ADDRESS);
  
  console.log("📋 Testing graduated tokens fetching...");
  
  // Test the same logic as the frontend
  const graduatedTokenAddresses: string[] = [];
  try {
    let index = 0;
    while (true) {
      try {
        const tokenAddress = await bonding.graduatedTokens(index);
        graduatedTokenAddresses.push(tokenAddress);
        console.log(`📍 Found graduated token ${index}: ${tokenAddress}`);
        index++;
      } catch (error) {
        // End of array reached
        break;
      }
    }
  } catch (error) {
    console.error('Failed to load graduated tokens list:', error);
    return;
  }

  console.log(`\n📊 Found ${graduatedTokenAddresses.length} graduated tokens`);
  
  // Test fetching token info for each graduated token
  for (const tokenAddress of graduatedTokenAddresses) {
    try {
      console.log(`\n🔍 Testing token: ${tokenAddress}`);
      
      // Get token info from bonding contract
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      console.log(`  📋 Creator: ${tokenInfo.creator}`);
      console.log(`  🎯 Trading on bonding curve: ${tokenInfo.trading}`);
      console.log(`  🦄 Trading on Uniswap: ${tokenInfo.tradingOnUniswap}`);
      console.log(`  🔗 Uniswap pair: ${tokenInfo.uniswapPair}`);
      
      // Test token contract
      const tokenContract = await ethers.getContractAt("FERC20", tokenAddress);
      const [name, symbol] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
      ]);
      console.log(`  🏷️  Name: ${name}`);
      console.log(`  🎫 Symbol: ${symbol}`);
      
      // Test Uniswap pair if it exists
      if (tokenInfo.uniswapPair && tokenInfo.uniswapPair !== '0x0000000000000000000000000000000000000000') {
        const pairContract = await ethers.getContractAt("IUniswapV2Pair", tokenInfo.uniswapPair);
        const [reserves, token0, token1] = await Promise.all([
          pairContract.getReserves(),
          pairContract.token0(),
          pairContract.token1(),
        ]);
        
        console.log(`  💰 Token0: ${token0}`);
        console.log(`  💰 Token1: ${token1}`);
        console.log(`  📊 Reserve0: ${ethers.formatEther(reserves.reserve0)}`);
        console.log(`  📊 Reserve1: ${ethers.formatEther(reserves.reserve1)}`);
        
        // Determine which token is which
        const isToken0Agent = token0.toLowerCase() === tokenAddress.toLowerCase();
        const tokenReserve = isToken0Agent ? reserves[0] : reserves[1];
        const easyVReserve = isToken0Agent ? reserves[1] : reserves[0];
        
        // Calculate price
        const price = easyVReserve > BigInt(0) ? (Number(easyVReserve) / Number(tokenReserve)).toFixed(6) : '0';
        console.log(`  💲 Price: ${price} EasyV per ${symbol}`);
        
        console.log(`  ✅ Uniswap pair data fetched successfully`);
      } else {
        console.log(`  ❌ No valid Uniswap pair found`);
      }
      
    } catch (error) {
      console.error(`  ❌ Failed to fetch data for token ${tokenAddress}:`, error);
    }
  }
  
  console.log("\n🎉 Frontend data fetching test completed!");
  console.log("🌐 The frontend should now be able to display graduated tokens at http://localhost:3000/graduated");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 