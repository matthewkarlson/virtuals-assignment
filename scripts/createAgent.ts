import { ethers } from "hardhat";

async function main() {
  console.log("🤖 Creating a new agent...");

  // Deployed contract addresses from the latest successful deployment
  const EASYV_ADDRESS = "0x8525A10eeBF11E689F4a456A2AE172eaC9DaD6C9";
  const AGENT_FACTORY_ADDRESS = "0x6953B3DA7a4A90cC14801F69566A8f48A59c9D04";

  const [deployer] = await ethers.getSigners();
  console.log("Creating agent with account:", deployer.address);

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);

  // Check EasyV balance
  const balance = await easyV.balanceOf(deployer.address);
  console.log("EasyV balance:", ethers.formatEther(balance));

  const minDeposit = await agentFactory.MIN_INITIAL_DEPOSIT();
  const fee = await agentFactory.FEE();
  // Use 200 ether like in the test since no AgentFactory fee
  const launchAmount = ethers.parseEther("200");
  console.log("Minimum deposit required:", ethers.formatEther(minDeposit), "EasyV");
  console.log("Fee:", ethers.formatEther(fee), "EasyV");
  console.log("Using launch amount:", ethers.formatEther(launchAmount), "EasyV");

  if (balance < launchAmount) {
    console.error("❌ Insufficient EasyV balance to create agent");
    console.error(`Need ${ethers.formatEther(launchAmount)} EasyV, have ${ethers.formatEther(balance)} EasyV`);
    return;
  }

  // Approve AgentFactory to spend EasyV
  console.log("📝 Approving EasyV spend...");
  const approveTx = await easyV.approve(AGENT_FACTORY_ADDRESS, launchAmount);
  await approveTx.wait();
  console.log("✅ Approval confirmed");

  // Create agent using the new launch method
  console.log("🚀 Launching agent...");
  const launchTx = await agentFactory.launchWithParams(
    "My AI Agent",
    "MYAI",
    [1], // cores - required to be non-empty
    "A test AI agent created via script",
    "https://example.com/image.png",
    ["", "", "", ""], // urls: twitter, telegram, youtube, website
    launchAmount
  );
  
  const receipt = await launchTx.wait();
  console.log("✅ Agent launched!");
  
  // Find the AgentLaunched event
  const agentLaunchedEvent = receipt?.logs.find(
    (log: any) => {
      try {
        const parsed = agentFactory.interface.parseLog(log);
        return parsed?.name === "AgentLaunched";
      } catch {
        return false;
      }
    }
  );

  if (agentLaunchedEvent) {
    const parsed = agentFactory.interface.parseLog(agentLaunchedEvent);
    const tokenAddress = parsed!.args[0];
    const creator = parsed!.args[1];
    const initialPurchase = parsed!.args[2];

    console.log("📊 Agent Details:");
    console.log("  Token Address:", tokenAddress);
    console.log("  Creator:", creator);
    console.log("  Initial Purchase:", ethers.formatEther(initialPurchase), "EasyV");

    // Check if token is authorized
    const isAuthorized = await agentFactory.authorizedTokens(tokenAddress);
    console.log("  Authorized:", isAuthorized);

    // Get bonding curve count
    const curveCount = await agentFactory.bondingCurveCount();
    console.log("  Total Tokens Created:", curveCount.toString());
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 