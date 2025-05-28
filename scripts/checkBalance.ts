import { ethers } from "hardhat";
import type { EasyV } from "../typechain-types";

async function main() {
  // Configuration - Update these values
  const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // Replace with your deployed EasyV contract address
  const WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";   // Replace with the wallet address to check

  try {
    console.log("🔍 Checking EasyV token balance...");
    console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
    console.log(`Wallet Address: ${WALLET_ADDRESS}`);
    console.log("─".repeat(50));

    // Get the contract instance
    const EasyV = await ethers.getContractFactory("EasyV");
    const easyV = EasyV.attach(CONTRACT_ADDRESS) as EasyV;

    // Get the balance
    const balance = await easyV.balanceOf(WALLET_ADDRESS);
    
    // Get token decimals and symbol for better formatting
    const decimals = await easyV.decimals();
    const symbol = await easyV.symbol();
    const name = await easyV.name();

    // Format the balance (convert from wei to human readable)
    const formattedBalance = ethers.formatUnits(balance, decimals);

    console.log(`Token Name: ${name}`);
    console.log(`Token Symbol: ${symbol}`);
    console.log(`Token Decimals: ${decimals}`);
    console.log(`Raw Balance: ${balance.toString()}`);
    console.log(`Formatted Balance: ${formattedBalance} ${symbol}`);
    
    // Additional info
    const totalSupply = await easyV.totalSupply();
    const formattedTotalSupply = ethers.formatUnits(totalSupply, decimals);
    
    console.log("─".repeat(50));
    console.log(`Total Supply: ${formattedTotalSupply} ${symbol}`);
    
    // Calculate percentage of total supply
    const percentage = (parseFloat(formattedBalance) / parseFloat(formattedTotalSupply)) * 100;
    console.log(`Percentage of Total Supply: ${percentage.toFixed(4)}%`);

  } catch (error) {
    console.error("❌ Error checking balance:", error);
    process.exit(1);
  }
}

// Handle script execution
main()
  .then(() => {
    console.log("✅ Balance check completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }); 