const fs = require('fs');
const path = require('path');

// Paths
const artifactsDir = path.join(__dirname, '../artifacts/contracts');
const outputDir = path.join(__dirname, '../virtuals-ui/src/lib/abis');

// Contract names to copy
const contracts = [
  'EasyV',
  'AgentFactory', 
  'BondingCurve',
  'AgentTokenExternal',
  'AgentTokenInternal'
];

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy ABIs
contracts.forEach(contractName => {
  const artifactPath = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
  const outputPath = path.join(outputDir, `${contractName}.json`);
  
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    // Extract just the ABI and contract name
    const abiData = {
      contractName: artifact.contractName,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(abiData, null, 2));
    console.log(`✓ Copied ABI for ${contractName}`);
  } else {
    console.warn(`⚠ Artifact not found for ${contractName} at ${artifactPath}`);
  }
});

console.log(`\n✅ ABIs copied to ${outputDir}`); 