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

interface GraduatedAgent {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  virtualRaised: string;
  externalTokenAddress: string;
  uniswapPairAddress: string;
  tokenBalance: string;
  easyVBalance: string;
  poolReserves: {
    token: string;
    easyV: string;
    price: string;
  };
}

interface PoolStats {
  totalLiquidity: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  userLPBalance: string;
}

export default function GraduatedAgents() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [graduatedAgents, setGraduatedAgents] = useState<GraduatedAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{ chainId: number; name: string; isCorrect: boolean } | null>(null);
  
  // Trading state
  const [selectedAgent, setSelectedAgent] = useState<GraduatedAgent | null>(null);
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell'>('buy');
  const [estimatedOutput, setEstimatedOutput] = useState('');

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
      // Check network status
      const network = await web3Service.getCurrentNetwork();
      setNetworkStatus(network);
      
      if (!network.isCorrect) {
        console.warn(`Wrong network detected. Expected Chain ID: 31337, Current: ${network.chainId}`);
        return;
      }
      
      await loadGraduatedAgents();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadGraduatedAgents = async () => {
    try {
      setLoading(true);
      
      // Get the current address directly from web3Service to avoid race conditions
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        console.warn('No wallet address available, skipping balance checks');
        return;
      }
      
      // Get graduated tokens from the main Bonding contract
      const bondingContract = web3Service.getBondingContract();
      
      // Get all graduated tokens from the graduatedTokens array
      const graduatedTokenAddresses: string[] = [];
      try {
        let index = 0;
        while (true) {
          try {
            const tokenAddress = await bondingContract.graduatedTokens(index);
            graduatedTokenAddresses.push(tokenAddress);
            index++;
          } catch (error) {
            // End of array reached
            break;
          }
        }
      } catch (error) {
        console.error('Failed to load graduated tokens list:', error);
        return;
      }

      console.log(`Found ${graduatedTokenAddresses.length} graduated tokens:`, graduatedTokenAddresses);
      
      const graduatedData: GraduatedAgent[] = [];
      
      for (const tokenAddress of graduatedTokenAddresses) {
        try {
          // Get token info from the main Bonding contract
          const tokenInfo = await bondingContract.tokenInfo(tokenAddress);
          
          // Validate that the token is actually graduated
          if (!tokenInfo.tradingOnUniswap) {
            console.warn(`Token ${tokenAddress} is in graduated list but not trading on Uniswap`);
            continue;
          }

          // Validate that we have valid addresses
          if (!tokenInfo.uniswapPair || tokenInfo.uniswapPair === '0x0000000000000000000000000000000000000000') {
            console.warn(`Token ${tokenAddress} is graduated but has no Uniswap pair address`);
            continue;
          }

          // Get token contract to fetch name and symbol
          const tokenContract = web3Service.getFERC20Contract(tokenAddress);
          const [name, symbol] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
          ]);

          // Get user balances using the current address
          const [tokenBalance, easyVBalance] = await Promise.all([
            tokenContract.balanceOf(currentAddress),
            web3Service.getEasyVContract().balanceOf(currentAddress),
          ]);

          // Get pool reserves from Uniswap pair
          const pairContract = web3Service.getUniswapPairContract(tokenInfo.uniswapPair);
          const [reserves, token0, token1] = await Promise.all([
            pairContract.getReserves(),
            pairContract.token0(),
            pairContract.token1(),
          ]);

          // Determine which token is which
          const isToken0Agent = token0.toLowerCase() === tokenAddress.toLowerCase();
          const tokenReserve = isToken0Agent ? reserves[0] : reserves[1];
          const easyVReserve = isToken0Agent ? reserves[1] : reserves[0];
          
          // Calculate price (EasyV per token)
          const price = easyVReserve > BigInt(0) ? (Number(easyVReserve) / Number(tokenReserve)).toFixed(6) : '0';

          graduatedData.push({
            address: tokenAddress,
            name: name.replace('fun ', ''), // Remove "fun " prefix if present
            symbol: symbol.replace('f', ''), // Remove "f" prefix if present
            creator: tokenInfo.creator,
            virtualRaised: '0', // This data is not easily available from tokenInfo, could be calculated if needed
            externalTokenAddress: tokenAddress, // The token itself is the external token after graduation
            uniswapPairAddress: tokenInfo.uniswapPair,
            tokenBalance: web3Service.formatEther(tokenBalance),
            easyVBalance: web3Service.formatEther(easyVBalance),
            poolReserves: {
              token: web3Service.formatEther(tokenReserve),
              easyV: web3Service.formatEther(easyVReserve),
              price,
            },
          });
        } catch (error) {
          console.error(`Failed to load graduated token ${tokenAddress}:`, error);
        }
      }
      
      console.log(`Successfully loaded ${graduatedData.length} graduated tokens`);
      setGraduatedAgents(graduatedData);
    } catch (error) {
      console.error('Failed to load graduated agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const estimateSwap = async (agent: GraduatedAgent, amount: string, direction: 'buy' | 'sell') => {
    if (!amount || parseFloat(amount) <= 0) {
      setEstimatedOutput('');
      return;
    }

    try {
      const router = web3Service.getUniswapRouterContract();
      const amountIn = web3Service.parseEther(amount);
      
      let path: string[];
      if (direction === 'buy') {
        // Buying tokens with EasyV
        path = [web3Service.getEasyVAddress(), agent.externalTokenAddress];
      } else {
        // Selling tokens for EasyV
        path = [agent.externalTokenAddress, web3Service.getEasyVAddress()];
      }

      const amounts = await router.getAmountsOut(amountIn, path);
      const outputAmount = amounts[amounts.length - 1];
      setEstimatedOutput(web3Service.formatEther(outputAmount));
    } catch (error) {
      console.error('Failed to estimate swap:', error);
      setEstimatedOutput('Error estimating');
    }
  };

  const executeSwap = async (agent: GraduatedAgent, amount: string, direction: 'buy' | 'sell') => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
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
      
      const router = web3Service.getUniswapRouterContract();
      const amountIn = web3Service.parseEther(amount);
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      
      let path: string[];
      let tokenToApprove: any;
      
      if (direction === 'buy') {
        // Buying tokens with EasyV
        const easyVContract = web3Service.getEasyVContract();
        path = [web3Service.getEasyVAddress(), agent.externalTokenAddress];
        tokenToApprove = easyVContract;
      } else {
        // Selling tokens for EasyV
        const tokenContract = web3Service.getFERC20Contract(agent.externalTokenAddress);
        path = [agent.externalTokenAddress, web3Service.getEasyVAddress()];
        tokenToApprove = tokenContract;
      }

      // Approve token spending
      const approveTx = await tokenToApprove.approve(router.target, amountIn);
      await approveTx.wait();

      // Execute swap with 5% slippage tolerance
      const amounts = await router.getAmountsOut(amountIn, path);
      const minAmountOut = amounts[amounts.length - 1] * BigInt(95) / BigInt(100); // 5% slippage

      const swapTx = await router.swapExactTokensForTokens(
        amountIn,
        minAmountOut,
        path,
        currentAddress,
        deadline
      );
      await swapTx.wait();

      // Reload data
      await loadData();
      setTradeAmount('');
      setEstimatedOutput('');
      
      alert(`${direction === 'buy' ? 'Purchase' : 'Sale'} completed successfully!`);
    } catch (error) {
      console.error(`Failed to execute ${direction}:`, error);
      alert(`Failed to execute ${direction}. Check console for details.`);
    } finally {
      setLoading(false);
    }
  };

  // Update estimate when trade parameters change
  useEffect(() => {
    if (selectedAgent && tradeAmount) {
      const timeoutId = setTimeout(() => {
        estimateSwap(selectedAgent, tradeAmount, tradeDirection);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setEstimatedOutput('');
    }
  }, [selectedAgent, tradeAmount, tradeDirection]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                ← Back to Main
              </Link>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Graduated Agents
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Trade agent tokens on Uniswap V2 pools
            </p>
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Graduated Agents List */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Graduated Agents ({graduatedAgents.length})</CardTitle>
                    <CardDescription>
                      Agents that have graduated to Uniswap V2 pools
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading && graduatedAgents.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        Loading graduated agents...
                      </div>
                    ) : graduatedAgents.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        No graduated agents found. Agents graduate when they reach their funding threshold.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {graduatedAgents.map((agent) => (
                          <div 
                            key={agent.address} 
                            className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                              selectedAgent?.address === agent.address 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                                : 'hover:border-slate-300'
                            }`}
                            onClick={() => setSelectedAgent(agent)}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h3 className="font-semibold text-lg">{agent.name}</h3>
                                <p className="text-sm text-slate-600">{agent.symbol}</p>
                              </div>
                              <Badge variant="default">🎓 Graduated</Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                              <div>
                                <span className="text-slate-600">Pool Price:</span>
                                <div className="font-medium">{agent.poolReserves.price} EasyV per {agent.symbol}</div>
                              </div>
                              <div>
                                <span className="text-slate-600">Total Raised:</span>
                                <div className="font-medium">{parseFloat(agent.virtualRaised).toFixed(2)} EasyV</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                              <div>
                                <span className="text-slate-600">Pool Liquidity:</span>
                                <div className="font-medium">
                                  {parseFloat(agent.poolReserves.token).toFixed(2)} {agent.symbol} / {parseFloat(agent.poolReserves.easyV).toFixed(2)} EasyV
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-600">Your Balance:</span>
                                <div className="font-medium">{parseFloat(agent.tokenBalance).toFixed(4)} {agent.symbol}</div>
                              </div>
                            </div>

                            <Separator className="my-3" />
                            
                            <div className="flex gap-2 text-xs text-slate-500">
                              <span>Pair: {agent.uniswapPairAddress.slice(0, 6)}...{agent.uniswapPairAddress.slice(-4)}</span>
                              <span>•</span>
                              <span>Creator: {agent.creator.slice(0, 6)}...{agent.creator.slice(-4)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Trading Panel */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Trade Agent Tokens</CardTitle>
                    <CardDescription>
                      {selectedAgent ? `Trade ${selectedAgent.symbol} on Uniswap` : 'Select an agent to trade'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedAgent ? (
                      <div className="space-y-4">
                        {/* Trade Direction Selector */}
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={tradeDirection === 'buy' ? 'default' : 'outline'}
                            onClick={() => setTradeDirection('buy')}
                            className="w-full"
                          >
                            Buy {selectedAgent.symbol}
                          </Button>
                          <Button
                            variant={tradeDirection === 'sell' ? 'default' : 'outline'}
                            onClick={() => setTradeDirection('sell')}
                            className="w-full"
                          >
                            Sell {selectedAgent.symbol}
                          </Button>
                        </div>
                        
                        {/* Amount Input */}
                        <div>
                          <Label htmlFor="trade-amount">
                            Amount ({tradeDirection === 'buy' ? 'EasyV' : selectedAgent.symbol})
                          </Label>
                          <Input
                            id="trade-amount"
                            type="number"
                            value={tradeAmount}
                            onChange={(e) => setTradeAmount(e.target.value)}
                            placeholder="0.0"
                            step="0.01"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Available: {tradeDirection === 'buy' 
                              ? `${parseFloat(selectedAgent.easyVBalance).toFixed(4)} EasyV`
                              : `${parseFloat(selectedAgent.tokenBalance).toFixed(4)} ${selectedAgent.symbol}`
                            }
                          </p>
                        </div>
                        
                        {/* Estimated Output */}
                        {estimatedOutput && (
                          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded">
                            <p className="text-sm">
                              <span className="text-slate-600">You will receive:</span>
                              <br />
                              <span className="font-medium">
                                {parseFloat(estimatedOutput).toFixed(6)} {tradeDirection === 'buy' ? selectedAgent.symbol : 'EasyV'}
                              </span>
                            </p>
                          </div>
                        )}
                        
                        {/* Execute Trade Button */}
                        <Button 
                          onClick={() => executeSwap(selectedAgent, tradeAmount, tradeDirection)}
                          disabled={loading || !tradeAmount || parseFloat(tradeAmount) <= 0 || (networkStatus?.isCorrect === false)}
                          className="w-full"
                        >
                          {loading ? 'Processing...' : `${tradeDirection === 'buy' ? 'Buy' : 'Sell'} ${selectedAgent.symbol}`}
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        Select a graduated agent from the list to start trading
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
              <CardTitle>Connect Your Wallet</CardTitle>
              <CardDescription>
                Connect your wallet to browse and trade graduated agent tokens
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