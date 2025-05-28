import { ethers } from 'ethers';
import { CONTRACTS, ABIS, NETWORK_CONFIG } from './contracts';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// Wrapper to log all contract method calls
function createLoggingContract(contract: ethers.Contract, contractName: string, address: string) {
  console.log(`🔧 Creating logging wrapper for ${contractName} at ${address}`);
  
  return new Proxy(contract, {
    get(target, prop, receiver) {
      const originalValue = Reflect.get(target, prop, receiver);
      
      // If it's a function (method), wrap it with logging
      if (typeof originalValue === 'function' && typeof prop === 'string') {
        return async function(...args: any[]) {
          console.log(`📞 ${contractName}.${prop}() called with args:`, args);
          console.log(`📞 Contract address: ${address}`);
          console.log(`📞 Method exists on contract:`, prop in target);
          
          try {
            const result = await originalValue.apply(target, args);
            console.log(`✅ ${contractName}.${prop}() succeeded with result:`, result);
            return result;
          } catch (error) {
            console.error(`❌ ${contractName}.${prop}() failed:`, error);
            console.error(`❌ Error details:`, {
              message: error instanceof Error ? error.message : 'Unknown error',
              code: error && typeof error === 'object' && 'code' in error ? error.code : 'No code',
              data: error && typeof error === 'object' && 'data' in error ? error.data : 'No data',
            });
            throw error;
          }
        };
      }
      
      return originalValue;
    }
  });
}

export class Web3Service {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  async connect(): Promise<string> {
    console.log('🔗 Web3Service.connect() called');
    
    if (!window.ethereum) {
      console.error('❌ MetaMask not found');
      throw new Error('MetaMask not found. Please install MetaMask.');
    }

    try {
      console.log('📝 Requesting account access...');
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      console.log('🌐 Creating provider and signer...');
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      
      // Check if we're on the correct network
      const network = await this.provider.getNetwork();
      console.log(`🌍 Current network: Chain ID ${network.chainId}, Expected: ${NETWORK_CONFIG.chainId}`);
      
      if (Number(network.chainId) !== NETWORK_CONFIG.chainId) {
        try {
          console.log('🔄 Attempting to switch network...');
          await this.switchNetwork();
        } catch (networkError) {
          console.warn('⚠️ Failed to switch network automatically:', networkError);
          // Don't throw here - let the user manually switch if needed
          console.log(`Please manually switch to Hardhat Local Network (Chain ID: ${NETWORK_CONFIG.chainId})`);
        }
      }

      const address = await this.signer.getAddress();
      console.log(`✅ Connected to wallet: ${address}`);
      return address;
    } catch (error) {
      console.error('❌ Failed to connect wallet:', error);
      throw error;
    }
  }

  async switchNetwork(): Promise<void> {
    console.log('🔄 Web3Service.switchNetwork() called');
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}` }],
      });
      console.log('✅ Network switched successfully');
    } catch (switchError: unknown) {
      console.log('⚠️ Switch network failed, trying to add network...');
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError && typeof switchError === 'object' && 'code' in switchError && switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}`,
              chainName: NETWORK_CONFIG.name,
              rpcUrls: [NETWORK_CONFIG.rpcUrl],
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
            }],
          });
          console.log('✅ Network added successfully');
        } catch (addError: unknown) {
          console.error('❌ Failed to add network:', addError);
          // If adding fails, try to switch again in case it was already added
          if (addError && typeof addError === 'object' && 'code' in addError && addError.code === -32603) {
            // Network might already exist, try switching again
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}` }],
            });
            console.log('✅ Network switched on retry');
          } else {
            throw addError;
          }
        }
      } else {
        throw switchError;
      }
    }
  }

  getContract(address: string, abi: any) {
    console.log(`📄 Web3Service.getContract() called with address: ${address}`);
    console.log(`📄 ABI type: ${typeof abi}, ABI length: ${Array.isArray(abi) ? abi.length : 'not array'}`);
    console.log(`📄 ABI preview:`, abi ? (Array.isArray(abi) ? abi.slice(0, 2) : abi) : 'undefined');
    
    if (!this.signer) {
      console.error('❌ Wallet not connected when trying to create contract');
      throw new Error('Wallet not connected');
    }
    
    try {
      const contract = new ethers.Contract(address, abi, this.signer);
      console.log(`✅ Contract created successfully for ${address}`);
      return createLoggingContract(contract, 'Contract', address);
    } catch (error) {
      console.error(`❌ Failed to create contract for ${address}:`, error);
      throw error;
    }
  }

  getEasyVContract() {
    console.log('🪙 Web3Service.getEasyVContract() called');
    console.log(`🪙 EasyV address: ${CONTRACTS.EASYV}`);
    console.log(`🪙 EasyV ABI available:`, !!ABIS.EasyV);
    const contract = new ethers.Contract(CONTRACTS.EASYV, ABIS.EasyV, this.signer!);
    return createLoggingContract(contract, 'EasyV', CONTRACTS.EASYV);
  }

  getAgentFactoryContract() {
    console.log('🏭 Web3Service.getAgentFactoryContract() called');
    console.log(`🏭 AgentFactory address: ${CONTRACTS.AGENT_FACTORY}`);
    console.log(`🏭 AgentFactory ABI available:`, !!ABIS.AgentFactory);
    const contract = new ethers.Contract(CONTRACTS.AGENT_FACTORY, ABIS.AgentFactory, this.signer!);
    return createLoggingContract(contract, 'AgentFactory', CONTRACTS.AGENT_FACTORY);
  }

  getBondingCurveContract(address: string) {
    console.log(`📈 Web3Service.getBondingCurveContract() called with address: ${address}`);
    console.log(`📈 BondingCurve ABI available:`, !!ABIS.BondingCurve);
    const contract = new ethers.Contract(address, ABIS.BondingCurve, this.signer!);
    return createLoggingContract(contract, 'BondingCurve', address);
  }

  // For internal tokens (used during bonding curve phase)
  getAgentTokenContract(address: string) {
    console.log(`🎫 Web3Service.getAgentTokenContract() called with address: ${address}`);
    console.log(`🎫 AgentTokenInternal ABI available:`, !!ABIS.AgentTokenInternal);
    console.log(`🎫 Using AgentTokenInternal ABI for internal token`);
    const contract = new ethers.Contract(address, ABIS.AgentTokenInternal, this.signer!);
    return createLoggingContract(contract, 'AgentTokenInternal', address);
  }

  // Alias for clarity - internal tokens
  getAgentTokenInternalContract(address: string) {
    console.log(`🎫📥 Web3Service.getAgentTokenInternalContract() called with address: ${address}`);
    console.log(`🎫📥 AgentTokenInternal ABI available:`, !!ABIS.AgentTokenInternal);
    const contract = new ethers.Contract(address, ABIS.AgentTokenInternal, this.signer!);
    return createLoggingContract(contract, 'AgentTokenInternal', address);
  }

  // External tokens (used after graduation)
  getAgentTokenExternalContract(address: string) {
    console.log(`🎫📤 Web3Service.getAgentTokenExternalContract() called with address: ${address}`);
    console.log(`🎫📤 AgentTokenExternal ABI available:`, !!ABIS.AgentTokenExternal);
    const contract = new ethers.Contract(address, ABIS.AgentTokenExternal, this.signer!);
    return createLoggingContract(contract, 'AgentTokenExternal', address);
  }

  async getBalance(address: string): Promise<string> {
    console.log(`💰 Web3Service.getBalance() called for address: ${address}`);
    if (!this.provider) {
      console.error('❌ Provider not initialized when getting balance');
      throw new Error('Provider not initialized');
    }
    try {
      const balance = await this.provider.getBalance(address);
      const formatted = ethers.formatEther(balance);
      console.log(`💰 Balance for ${address}: ${formatted} ETH`);
      return formatted;
    } catch (error) {
      console.error(`❌ Failed to get balance for ${address}:`, error);
      throw error;
    }
  }

  formatEther(value: bigint | string): string {
    console.log(`🔢 Web3Service.formatEther() called with value: ${value} (type: ${typeof value})`);
    try {
      const result = ethers.formatEther(value);
      console.log(`🔢 Formatted result: ${result}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to format ether:`, error);
      throw error;
    }
  }

  parseEther(value: string): bigint {
    console.log(`🔢 Web3Service.parseEther() called with value: ${value}`);
    try {
      const result = ethers.parseEther(value);
      console.log(`🔢 Parsed result: ${result}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to parse ether:`, error);
      throw error;
    }
  }

  async getCurrentNetwork(): Promise<{ chainId: number; name: string; isCorrect: boolean }> {
    console.log('🌍 Web3Service.getCurrentNetwork() called');
    if (!this.provider) {
      console.error('❌ Provider not initialized when getting network');
      throw new Error('Provider not initialized');
    }
    
    try {
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);
      
      const result = {
        chainId,
        name: chainId === NETWORK_CONFIG.chainId ? NETWORK_CONFIG.name : `Chain ${chainId}`,
        isCorrect: chainId === NETWORK_CONFIG.chainId,
      };
      
      console.log(`🌍 Current network:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Failed to get current network:`, error);
      throw error;
    }
  }

  isConnected(): boolean {
    const connected = this.signer !== null;
    console.log(`🔗 Web3Service.isConnected(): ${connected}`);
    return connected;
  }

  async getAddress(): Promise<string> {
    console.log('📍 Web3Service.getAddress() called');
    if (!this.signer) {
      console.error('❌ Wallet not connected when getting address');
      throw new Error('Wallet not connected');
    }
    try {
      const address = await this.signer.getAddress();
      console.log(`📍 Current address: ${address}`);
      return address;
    } catch (error) {
      console.error(`❌ Failed to get address:`, error);
      throw error;
    }
  }
}

export const web3Service = new Web3Service(); 