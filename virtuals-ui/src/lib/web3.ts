import { ethers } from 'ethers';
import { CONTRACTS, ABIS, NETWORK_CONFIG } from './contracts';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export class Web3Service {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error('MetaMask not found. Please install MetaMask.');
    }

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      
      // Check if we're on the correct network
      const network = await this.provider.getNetwork();
      if (Number(network.chainId) !== NETWORK_CONFIG.chainId) {
        try {
          await this.switchNetwork();
        } catch (networkError) {
          console.warn('Failed to switch network automatically:', networkError);
          // Don't throw here - let the user manually switch if needed
          console.log(`Please manually switch to Hardhat Local Network (Chain ID: ${NETWORK_CONFIG.chainId})`);
        }
      }

      return await this.signer.getAddress();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }

  async switchNetwork(): Promise<void> {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}` }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
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
        } catch (addError: any) {
          console.error('Failed to add network:', addError);
          // If adding fails, try to switch again in case it was already added
          if (addError.code === -32603) {
            // Network might already exist, try switching again
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${NETWORK_CONFIG.chainId.toString(16)}` }],
            });
          } else {
            throw addError;
          }
        }
      } else {
        throw switchError;
      }
    }
  }

  getContract(address: string, abi: readonly string[]) {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }
    return new ethers.Contract(address, abi, this.signer);
  }

  getEasyVContract() {
    return this.getContract(CONTRACTS.EASYV, ABIS.EasyV);
  }

  getAgentFactoryContract() {
    return this.getContract(CONTRACTS.AGENT_FACTORY, ABIS.AgentFactory);
  }

  getBondingCurveContract(address: string) {
    return this.getContract(address, ABIS.BondingCurve);
  }

  getAgentTokenContract(address: string) {
    return this.getContract(address, ABIS.AgentToken);
  }

  async getBalance(address: string): Promise<string> {
    if (!this.provider) throw new Error('Provider not initialized');
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  formatEther(value: bigint | string): string {
    return ethers.formatEther(value);
  }

  parseEther(value: string): bigint {
    return ethers.parseEther(value);
  }

  async getCurrentNetwork(): Promise<{ chainId: number; name: string; isCorrect: boolean }> {
    if (!this.provider) throw new Error('Provider not initialized');
    
    const network = await this.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    return {
      chainId,
      name: chainId === NETWORK_CONFIG.chainId ? NETWORK_CONFIG.name : `Chain ${chainId}`,
      isCorrect: chainId === NETWORK_CONFIG.chainId,
    };
  }

  isConnected(): boolean {
    return this.signer !== null;
  }

  async getAddress(): Promise<string> {
    if (!this.signer) throw new Error('Wallet not connected');
    return await this.signer.getAddress();
  }
}

export const web3Service = new Web3Service(); 