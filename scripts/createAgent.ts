import { ethers } from "hardhat";

async function main() {
  console.log("🤖 Creating a new agent...");

  // Deployed contract addresses from the successful deployment
  const EASYV_ADDRESS = "0x43F48c3DC6df4674219923F2d4f8880d5E3CCC4c";
  const AGENT_FACTORY_ADDRESS = "0x512F94E0a875516da53e2e59aC1995d6B2fbF781";

  const [deployer] = await ethers.getSigners();
  console.log("Creating agent with account:", deployer.address);

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);

  // Check EasyV balance
  const balance = await easyV.balanceOf(deployer.address);
  console.log("EasyV balance:", ethers.formatEther(balance));

  const minDeposit = await agentFactory.MIN_INITIAL_DEPOSIT();
  console.log("Minimum deposit required:", ethers.formatEther(minDeposit), "EasyV");

  if (balance < minDeposit) {
    console.error("❌ Insufficient EasyV balance to create agent");
    return;
  }

  // Approve AgentFactory to spend EasyV
  console.log("📝 Approving EasyV spend...");
  const approveTx = await easyV.approve(AGENT_FACTORY_ADDRESS, minDeposit);
  await approveTx.wait();
  console.log("✅ Approval confirmed");

  // Create agent
  console.log("🚀 Creating agent...");
  const createTx = await agentFactory.createAgent(
    "My AI Agent",
    "MYAI",
    minDeposit
  );
  
  const receipt = await createTx.wait();
  console.log("✅ Agent created!");
  
  // Find the AgentCreated event
  const agentCreatedEvent = receipt?.logs.find(
    (log: any) => {
      try {
        const parsed = agentFactory.interface.parseLog(log);
        return parsed?.name === "AgentCreated";
      } catch {
        return false;
      }
    }
  );

  if (agentCreatedEvent) {
    const parsed = agentFactory.interface.parseLog(agentCreatedEvent);
    const bondingCurveAddress = parsed!.args[0];
    const creator = parsed!.args[1];
    const name = parsed!.args[2];
    const symbol = parsed!.args[3];

    console.log("📊 Agent Details:");
    console.log("  Name:", name);
    console.log("  Symbol:", symbol);
    console.log("  Creator:", creator);
    console.log("  Bonding Curve:", bondingCurveAddress);

    // Get bonding curve details
    const bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);
    const virtualRaised = await bondingCurve.virtualRaised();
    const tokensSold = await bondingCurve.tokensSold();
    
    console.log("  Virtual Raised:", ethers.formatEther(virtualRaised));
    console.log("  Tokens Sold:", ethers.formatEther(tokensSold));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 