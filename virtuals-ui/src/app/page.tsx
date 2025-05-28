'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { web3Service } from '@/lib/web3';
import Link from 'next/link';

interface Agent {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  virtualRaised: string;
  graduated: boolean;
  tokensSold: string;
  graduationThreshold?: string;
  externalTokenAddress?: string;
  uniswapPairAddress?: string;
  internalTokenBalance: string;
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [easyVBalance, setEasyVBalance] = useState('0');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{ chainId: number; name: string; isCorrect: boolean } | null>(null);
  
  // Create agent form
  const [agentName, setAgentName] = useState('');
  const [agentSymbol, setAgentSymbol] = useState('');
  const [deposit, setDeposit] = useState('6000');
  const [buyAmount, setBuyAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');

  const checkConnection = useCallback(async () => {
    try {
      if (web3Service.isConnected()) {
        const addr = await web3Service.getAddress();
        setAddress(addr);
        setIsConnected(true);
        await loadData();
      }
    } catch (error) {
      console.error('Connection check failed:', error);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connectWallet = async () => {
    try {
      setLoading(true);
      const addr = await web3Service.connect();
      setAddress(addr);
      setIsConnected(true);
      await loadData();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Make sure MetaMask is installed and connected to Hardhat network.');
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      // Get current address
      const currentAddress = await web3Service.getAddress();
      
      // Check network status
      const network = await web3Service.getCurrentNetwork();
      setNetworkStatus(network);
      
      if (!network.isCorrect) {
        console.warn(`Wrong network detected. Expected Chain ID: 31337, Current: ${network.chainId}`);
        return; // Don't try to load contract data on wrong network
      }
      
      // Load EasyV balance
      const easyVContract = web3Service.getEasyVContract();
      const balance = await easyVContract.balanceOf(currentAddress);
      setEasyVBalance(web3Service.formatEther(balance));

      // Load agents
      await loadAgents();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadAgents = async () => {
    try {
      // Get the current address directly from web3Service to avoid race conditions
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        console.warn('No wallet address available, skipping balance checks');
        return;
      }
      
      const factoryContract = web3Service.getAgentFactoryContract();
      const agentAddresses = await factoryContract.allAgents();
      
      const agentData: Agent[] = [];
      for (const agentAddress of agentAddresses) {
        try {
          const bondingCurve = web3Service.getBondingCurveContract(agentAddress);
          const [virtualRaised, graduated, tokensSold, creator, graduationThreshold] = await Promise.all([
            bondingCurve.virtualRaised(),
            bondingCurve.graduated(),
            bondingCurve.tokensSold(),
            bondingCurve.creator(),
            bondingCurve.GRADUATION_THRESHOLD(),
          ]);

          // Get token info
          const iTokenAddress = await bondingCurve.iToken();
          const iToken = web3Service.getAgentTokenContract(iTokenAddress);
          const [name, symbol] = await Promise.all([
            iToken.name(),
            iToken.symbol(),
          ]);

          // Get external token info if graduated
          let externalTokenAddress: string | undefined;
          let uniswapPairAddress: string | undefined;
          let internalTokenBalance: string = '0';
          
          if (graduated) {
            try {
              externalTokenAddress = await bondingCurve.eToken();
              uniswapPairAddress = await bondingCurve.uniswapPair();
              
              // Get user's internal token balance for graduated agents using current address
              const iTokenAddress = await bondingCurve.iToken();
              const iToken = web3Service.getAgentTokenInternalContract(iTokenAddress);
              const balance = await iToken.balanceOf(currentAddress);
              internalTokenBalance = web3Service.formatEther(balance);
            } catch (error) {
              console.error(`Failed to get external token info for ${agentAddress}:`, error);
            }
          }

          agentData.push({
            address: agentAddress,
            name: name.replace('fun ', ''), // Remove "fun " prefix
            symbol: symbol.replace('f', ''), // Remove "f" prefix
            creator,
            virtualRaised: web3Service.formatEther(virtualRaised),
            graduated,
            tokensSold: web3Service.formatEther(tokensSold),
            graduationThreshold: web3Service.formatEther(graduationThreshold),
            externalTokenAddress,
            uniswapPairAddress,
            internalTokenBalance,
          });
        } catch (error) {
          console.error(`Failed to load agent ${agentAddress}:`, error);
        }
      }
      
      setAgents(agentData);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const createAgent = async () => {
    if (!agentName || !agentSymbol) {
      alert('Please enter agent name and symbol');
      return;
    }

    try {
      setLoading(true);
      
      // Get the current address directly from web3Service to avoid race conditions
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const easyVContract = web3Service.getEasyVContract();
      const factoryContract = web3Service.getAgentFactoryContract();
      const depositAmount = web3Service.parseEther(deposit);

      // Check balance
      const balance = await easyVContract.balanceOf(currentAddress);
      if (balance < depositAmount) {
        alert('Insufficient EasyV balance');
        return;
      }

      // Approve spending
      const approveTx = await easyVContract.approve(factoryContract.target, depositAmount);
      await approveTx.wait();

      // Create agent
      const createTx = await factoryContract.createAgent(agentName, agentSymbol, depositAmount);
      await createTx.wait();

      // Reset form
      setAgentName('');
      setAgentSymbol('');
      setDeposit('6000');

      // Reload data
      await loadData();
      
      alert('Agent created successfully!');
    } catch (error) {
      console.error('Failed to create agent:', error);
      alert('Failed to create agent. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const buyTokens = async (agentAddress: string, amount: string) => {
    try {
      setLoading(true);
      
      // Get the current address directly from web3Service to avoid race conditions
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const easyVContract = web3Service.getEasyVContract();
      const bondingCurve = web3Service.getBondingCurveContract(agentAddress);
      const buyAmount = web3Service.parseEther(amount);

      // Approve spending
      const approveTx = await easyVContract.approve(bondingCurve.target, buyAmount);
      await approveTx.wait();

      // Buy tokens
      const buyTx = await bondingCurve.buy(buyAmount, 0);
      await buyTx.wait();

      // Reload data
      await loadData();
      
      alert('Tokens purchased successfully!');
    } catch (error) {
      console.error('Failed to buy tokens:', error);
      alert('Failed to buy tokens. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const redeemTokens = async (agentAddress: string, amount: string) => {
    try {
      setLoading(true);
      
      // Get the current address directly from web3Service to avoid race conditions
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const bondingCurve = web3Service.getBondingCurveContract(agentAddress);
      
      // Check if agent is graduated
      const graduated = await bondingCurve.graduated();
      if (!graduated) {
        alert('This agent has not graduated yet. Redemption is only available for graduated agents.');
        return;
      }
      
      const iTokenAddress = await bondingCurve.iToken();
      const iToken = web3Service.getAgentTokenInternalContract(iTokenAddress);
      const redeemAmount = web3Service.parseEther(amount);

      // Check user's internal token balance
      const userBalance = await iToken.balanceOf(currentAddress);
      if (userBalance < redeemAmount) {
        alert(`Insufficient internal token balance. You have ${web3Service.formatEther(userBalance)} tokens but trying to redeem ${amount}.`);
        return;
      }

      // Check current allowance
      const currentAllowance = await iToken.allowance(currentAddress, bondingCurve.target);
      if (currentAllowance < redeemAmount) {
        console.log(`Current allowance: ${web3Service.formatEther(currentAllowance)}, needed: ${amount}`);
        
        // Approve bonding curve to burn internal tokens
        const approveTx = await iToken.approve(bondingCurve.target, redeemAmount);
        await approveTx.wait();
        console.log('Approval transaction completed');
      }

      // Redeem tokens
      const redeemTx = await bondingCurve.redeem(redeemAmount);
      await redeemTx.wait();

      // Reload data
      await loadData();
      
      alert('Tokens redeemed successfully!');
    } catch (error) {
      console.error('Failed to redeem tokens:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('ERC20InsufficientAllowance')) {
          alert('Insufficient allowance. Please try again - the approval might not have been processed yet.');
        } else if (error.message.includes('ERC20InsufficientBalance')) {
          alert('Insufficient token balance for redemption.');
        } else if (error.message.includes('!grad')) {
          alert('This agent has not graduated yet. Redemption is only available for graduated agents.');
        } else {
          alert(`Failed to redeem tokens: ${error.message}`);
        }
      } else {
        alert('Failed to redeem tokens. Check console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            EasyV Protocol
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Create and trade AI agents with bonding curves
            </p>
            <div className="flex gap-4 mt-3">
              <Link href="/graduated" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                🎓 View Graduated Agents →
              </Link>
            </div>
          </div>
          
          {!isConnected ? (
            <Button onClick={connectWallet} disabled={loading} size="lg">
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          ) : (
            <div className="text-right">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
              <div className="text-lg font-semibold">
                {parseFloat(easyVBalance).toFixed(2)} EasyV
              </div>
            </div>
          )}
        </div>

        {isConnected ? (
          <>
            {/* Network Warning */}
            {networkStatus && !networkStatus.isCorrect && (
              <Card className="mb-6 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <p className="font-semibold">Wrong Network Detected</p>
                      <p className="text-sm">
                        You&apos;re connected to {networkStatus.name} (Chain ID: {networkStatus.chainId}). 
                        Please switch to Hardhat Local Network (Chain ID: 31337) to use this app.
                      </p>
                      <p className="text-xs mt-1">
                        Add network manually: RPC URL: http://localhost:8545, Chain ID: 31337
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Create Agent */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Create New Agent</CardTitle>
                    <CardDescription>
                      Deploy a new AI agent with bonding curve
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="name">Agent Name</Label>
                      <Input
                        id="name"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="My AI Agent"
                      />
                    </div>
                    <div>
                      <Label htmlFor="symbol">Symbol</Label>
                      <Input
                        id="symbol"
                        value={agentSymbol}
                        onChange={(e) => setAgentSymbol(e.target.value.toUpperCase())}
                        placeholder="MYAI"
                      />
                    </div>
                    <div>
                      <Label htmlFor="deposit">Initial Deposit (EasyV)</Label>
                      <Input
                        id="deposit"
                        type="number"
                        value={deposit}
                        onChange={(e) => setDeposit(e.target.value)}
                        min="6000"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Minimum: 6,000 EasyV
                      </p>
                    </div>
                    <Button 
                      onClick={createAgent} 
                      disabled={loading || !agentName || !agentSymbol || (networkStatus?.isCorrect === false)}
                      className="w-full"
                    >
                      {loading ? 'Creating...' : 'Create Agent'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Agents List */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Agents</CardTitle>
                    <CardDescription>
                      Browse and interact with deployed agents
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {agents.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        No agents created yet. Create the first one!
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {agents.map((agent, index) => (
                          <div key={agent.address} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h3 className="font-semibold text-lg">{agent.name}</h3>
                                <p className="text-sm text-slate-600">{agent.symbol}</p>
                              </div>
                              <Badge variant={agent.graduated ? "default" : "secondary"}>
                                {agent.graduated ? "Graduated" : "Bonding"}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                              <div>
                                <span className="text-slate-600">Virtual Raised:</span>
                                <div className="font-medium">{parseFloat(agent.virtualRaised).toFixed(2)} EasyV</div>
                              </div>
                              <div>
                                <span className="text-slate-600">Tokens Sold:</span>
                                <div className="font-medium">{parseFloat(agent.tokensSold).toFixed(8)}</div>
                              </div>
                            </div>

                            {!agent.graduated && agent.graduationThreshold && (
                              <div className="mb-3">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-slate-600">Graduation Progress:</span>
                                  <span className="text-slate-600">
                                    {((parseFloat(agent.virtualRaised) / parseFloat(agent.graduationThreshold)) * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                    style={{ 
                                      width: `${Math.min(100, (parseFloat(agent.virtualRaised) / parseFloat(agent.graduationThreshold)) * 100)}%` 
                                    }}
                                  ></div>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  Need {(parseFloat(agent.graduationThreshold) - parseFloat(agent.virtualRaised)).toFixed(2)} more EasyV to graduate
                                </p>
                              </div>
                            )}

                            {agent.graduated && agent.externalTokenAddress && (
                              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                <h4 className="font-semibold text-green-800 mb-2">🎓 Graduated Agent</h4>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <span className="font-medium">External Token:</span>{' '}
                                    <span className="font-mono text-xs">{agent.externalTokenAddress}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium">Uniswap Pair:</span>{' '}
                                    <span className="font-mono text-xs">{agent.uniswapPairAddress}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium">Your Internal Tokens:</span>{' '}
                                    <span className="font-semibold">{agent.internalTokenBalance} tokens</span>
                                  </div>
                                  
                                  {parseFloat(agent.internalTokenBalance) > 0 && (
                                    <div className="mt-3">
                                      <div className="flex gap-2">
                                        <input
                                          type="number"
                                          placeholder="Amount to redeem"
                                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                                          value={redeemAmount}
                                          onChange={(e) => setRedeemAmount(e.target.value)}
                                          max={agent.internalTokenBalance}
                                        />
                                        <Button
                                          onClick={() => redeemTokens(agent.address, redeemAmount)}
                                          disabled={loading || !redeemAmount || parseFloat(redeemAmount) <= 0}
                                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
                                        >
                                          Redeem
                                        </Button>
                                      </div>
                                      <p className="text-xs text-gray-600 mt-1">
                                        Redeem internal tokens for external tokens (1:1 ratio)
                                      </p>
                                    </div>
                                  )}
                                  
                                  {parseFloat(agent.internalTokenBalance) === 0 && (
                                    <p className="text-sm text-gray-600 mt-2">
                                      You don't have any internal tokens to redeem for this agent.
                                    </p>
                                  )}
                                  
                                  <div className="mt-3 pt-3 border-t border-green-200">
                                    <Link 
                                      href="/graduated" 
                                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                                    >
                                      Trade on Uniswap →
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <Separator className="my-3" />
                            
                            <div className="flex gap-2">
                              <Input
                                placeholder="Amount (EasyV)"
                                className="flex-1"
                                id={`buy-${index}`}
                              />
                              <Button
                                onClick={() => {
                                  const input = document.getElementById(`buy-${index}`) as HTMLInputElement;
                                  if (input.value) {
                                    buyTokens(agent.address, input.value);
                                  }
                                }}
                                disabled={loading || agent.graduated || (networkStatus?.isCorrect === false)}
                                size="sm"
                              >
                                Buy Tokens
                              </Button>
                            </div>
                            
                            <p className="text-xs text-slate-500 mt-2">
                              Creator: {agent.creator.slice(0, 6)}...{agent.creator.slice(-4)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle>Welcome to Virtuals Protocol</CardTitle>
              <CardDescription>
                Connect your wallet to start creating and trading AI agents
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={connectWallet} disabled={loading} size="lg">
                {loading ? 'Connecting...' : 'Connect Wallet'}
              </Button>
              <p className="text-xs text-slate-500 mt-4">
                Make sure you&apos;re connected to the Hardhat local network
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
