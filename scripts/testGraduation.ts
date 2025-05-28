import { ethers } from "hardhat";

async function main() {
  console.log("🎓 Testing Agent Graduation and Redemption Flow...");

  // Deployed contract addresses
  const EASYV_ADDRESS = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6";
  const AGENT_FACTORY_ADDRESS = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";
  
  // The bonding curve address from our previous agent creation
  const BONDING_CURVE_ADDRESS = "0x3Ef81EaED45a2ee5c3416f0E52781Cf0248CC625";

  const [deployer, buyer1, buyer2] = await ethers.getSigners();
  console.log("Testing with accounts:");
  console.log("- Deployer:", deployer.address);
  console.log("- Buyer 1:", buyer1.address);
  console.log("- Buyer 2:", buyer2.address);

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);
  const bondingCurve = await ethers.getContractAt("BondingCurve", BONDING_CURVE_ADDRESS);

  // Check graduation threshold
  const gradThreshold = await bondingCurve.GRADUATION_THRESHOLD();
  console.log("\n📊 Graduation Threshold:", ethers.formatEther(gradThreshold), "EasyV");

  // Check current state
  let virtualRaised = await bondingCurve.virtualRaised();
  let tokensSold = await bondingCurve.tokensSold();
  let graduated = await bondingCurve.graduated();
  
  console.log("\n📈 Current State:");
  console.log("- Virtual Raised:", ethers.formatEther(virtualRaised), "EasyV");
  console.log("- Tokens Sold:", ethers.formatEther(tokensSold));
  console.log("- Graduated:", graduated);
  console.log("- Remaining to graduate:", ethers.formatEther(gradThreshold - virtualRaised), "EasyV");

  if (graduated) {
    console.log("✅ Agent already graduated! Skipping to redemption test...");
  } else {
    // Transfer some EasyV to other accounts for testing
    console.log("\n💰 Distributing EasyV to test accounts...");
    const transferAmount = ethers.parseEther("20000");
    
    await easyV.transfer(buyer1.address, transferAmount);
    await easyV.transfer(buyer2.address, transferAmount);
    
    console.log("✅ Transferred", ethers.formatEther(transferAmount), "EasyV to each buyer");

    // Calculate how much more we need to buy to reach graduation
    const remainingToGrad = gradThreshold - virtualRaised;
    const buyAmount1 = remainingToGrad / 2n; // Split between two buyers
    const buyAmount2 = remainingToGrad - buyAmount1 + ethers.parseEther("1000"); // Add extra to ensure graduation

    console.log("\n🛒 Buying tokens to trigger graduation...");
    
    // Buyer 1 buys tokens
    console.log("👤 Buyer 1 purchasing", ethers.formatEther(buyAmount1), "EasyV worth of tokens...");
    await easyV.connect(buyer1).approve(BONDING_CURVE_ADDRESS, buyAmount1);
    const buy1Tx = await bondingCurve.connect(buyer1).buy(buyAmount1, 0);
    const buy1Receipt = await buy1Tx.wait();
    
    // Find Buy event
    const buy1Event = buy1Receipt?.logs.find((log: any) => {
      try {
        const parsed = bondingCurve.interface.parseLog(log);
        return parsed?.name === "Buy";
      } catch {
        return false;
      }
    });
    
    if (buy1Event) {
      const parsed = bondingCurve.interface.parseLog(buy1Event);
      const [buyer, virtualIn, tokensOut] = parsed!.args;
      console.log("✅ Buyer 1 received", ethers.formatEther(tokensOut), "tokens for", ethers.formatEther(virtualIn), "EasyV");
    }

    // Check if graduated after first buy
    graduated = await bondingCurve.graduated();
    virtualRaised = await bondingCurve.virtualRaised();
    
    console.log("📊 After Buyer 1 purchase:");
    console.log("- Virtual Raised:", ethers.formatEther(virtualRaised), "EasyV");
    console.log("- Graduated:", graduated);

    if (!graduated) {
      // Buyer 2 buys tokens to trigger graduation
      console.log("\n👤 Buyer 2 purchasing", ethers.formatEther(buyAmount2), "EasyV worth of tokens...");
      await easyV.connect(buyer2).approve(BONDING_CURVE_ADDRESS, buyAmount2);
      const buy2Tx = await bondingCurve.connect(buyer2).buy(buyAmount2, 0);
      const buy2Receipt = await buy2Tx.wait();
      
      // Check for Graduate event
      const graduateEvent = buy2Receipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Graduate";
        } catch {
          return false;
        }
      });
      
      if (graduateEvent) {
        const parsed = bondingCurve.interface.parseLog(graduateEvent);
        const [externalTokenAddress] = parsed!.args;
        console.log("🎓 GRADUATION TRIGGERED!");
        console.log("✅ External token deployed at:", externalTokenAddress);
      }
    }
  }

  // Final state check
  virtualRaised = await bondingCurve.virtualRaised();
  tokensSold = await bondingCurve.tokensSold();
  graduated = await bondingCurve.graduated();
  
  console.log("\n🎯 Final State:");
  console.log("- Virtual Raised:", ethers.formatEther(virtualRaised), "EasyV");
  console.log("- Tokens Sold:", ethers.formatEther(tokensSold));
  console.log("- Graduated:", graduated);

  if (graduated) {
    console.log("\n🔄 Testing Redemption Process...");
    
    // Get external token address
    const externalTokenAddress = await bondingCurve.eToken();
    const externalToken = await ethers.getContractAt("AgentTokenExternal", externalTokenAddress);
    const internalToken = await bondingCurve.iToken();
    const internalTokenContract = await ethers.getContractAt("AgentTokenInternal", internalToken);
    
    console.log("📋 Token Addresses:");
    console.log("- Internal Token:", internalToken);
    console.log("- External Token:", externalTokenAddress);
    
    // Check balances before redemption
    const buyer1InternalBalance = await internalTokenContract.balanceOf(buyer1.address);
    const buyer1ExternalBalance = await externalToken.balanceOf(buyer1.address);
    
    console.log("\n💼 Buyer 1 Balances Before Redemption:");
    console.log("- Internal Tokens:", ethers.formatEther(buyer1InternalBalance));
    console.log("- External Tokens:", ethers.formatEther(buyer1ExternalBalance));
    
    if (buyer1InternalBalance > 0) {
      // Redeem half of internal tokens
      const redeemAmount = buyer1InternalBalance / 2n;
      console.log("\n🔄 Buyer 1 redeeming", ethers.formatEther(redeemAmount), "internal tokens...");
      
      // Approve bonding curve to burn internal tokens
      await internalTokenContract.connect(buyer1).approve(BONDING_CURVE_ADDRESS, redeemAmount);
      
      const redeemTx = await bondingCurve.connect(buyer1).redeem(redeemAmount);
      const redeemReceipt = await redeemTx.wait();
      
      // Check for Redeem event
      const redeemEvent = redeemReceipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Redeem";
        } catch {
          return false;
        }
      });
      
      if (redeemEvent) {
        const parsed = bondingCurve.interface.parseLog(redeemEvent);
        const [user, amount] = parsed!.args;
        console.log("✅ Redemption successful!");
        console.log("- User:", user);
        console.log("- Amount:", ethers.formatEther(amount));
      }
      
      // Check balances after redemption
      const buyer1InternalBalanceAfter = await internalTokenContract.balanceOf(buyer1.address);
      const buyer1ExternalBalanceAfter = await externalToken.balanceOf(buyer1.address);
      
      console.log("\n💼 Buyer 1 Balances After Redemption:");
      console.log("- Internal Tokens:", ethers.formatEther(buyer1InternalBalanceAfter));
      console.log("- External Tokens:", ethers.formatEther(buyer1ExternalBalanceAfter));
      console.log("- Redeemed Amount:", ethers.formatEther(buyer1ExternalBalanceAfter - buyer1ExternalBalance));
    } else {
      console.log("❌ Buyer 1 has no internal tokens to redeem");
    }
  } else {
    console.log("❌ Agent has not graduated yet. Cannot test redemption.");
  }

  console.log("\n🎉 Graduation and Redemption Test Complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 