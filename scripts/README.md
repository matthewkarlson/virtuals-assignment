# EasyV Balance Checker Script

This script allows you to check the balance of any wallet address for the EasyV token contract.

## Setup

1. Make sure you have deployed the EasyV contract and have the contract address
2. Update the configuration in `checkBalance.ts`:
   - Replace `CONTRACT_ADDRESS` with your deployed EasyV contract address
   - Replace `WALLET_ADDRESS` with the wallet address you want to check

## Usage

```bash
# Run the balance checker script
npx hardhat run scripts/checkBalance.ts --network <network-name>

# Example for localhost/hardhat network
npx hardhat run scripts/checkBalance.ts --network localhost

# Example for a testnet (if configured)
npx hardhat run scripts/checkBalance.ts --network sepolia
```

## Example Output

```
🔍 Checking EasyV token balance...
Contract Address: 0x1234567890123456789012345678901234567890
Wallet Address: 0x0987654321098765432109876543210987654321
──────────────────────────────────────────────────
Token Name: EasyV
Token Symbol: EASYV
Token Decimals: 18
Raw Balance: 1000000000000000000000
Formatted Balance: 1000.0 EASYV
──────────────────────────────────────────────────
Total Supply: 10000.0 EASYV
Percentage of Total Supply: 10.0000%
✅ Balance check completed successfully
```

## What the script does

- Connects to the EasyV contract using the provided address
- Calls `balanceOf()` to get the raw balance
- Fetches token metadata (name, symbol, decimals)
- Formats the balance from wei to human-readable format
- Shows additional information like total supply and percentage ownership 