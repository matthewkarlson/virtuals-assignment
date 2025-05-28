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

// Interface contracts to copy (from interfaces directory)
const interfaces = [
  'IUniswapV2Router02',
  'IUniswapV2Pair',
  'IUniswapV2Factory'
];

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy main contract ABIs
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

// Copy interface ABIs
interfaces.forEach(interfaceName => {
  const artifactPath = path.join(artifactsDir, 'interfaces', `${interfaceName}.sol`, `${interfaceName}.json`);
  const outputPath = path.join(outputDir, `${interfaceName}.json`);
  
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
    console.log(`✓ Copied ABI for ${interfaceName}`);
  } else {
    console.warn(`⚠ Interface artifact not found for ${interfaceName} at ${artifactPath}`);
  }
});

console.log(`\n✅ ABIs copied to ${outputDir}`); 