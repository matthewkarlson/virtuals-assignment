# Bonding Curve Simulator

An interactive Streamlit application for modeling and simulating different bonding curve approaches with Monte Carlo simulations.

## Overview

This simulator allows you to:
- Explore different bonding curve types (Linear, Exponential, Polynomial, Logarithmic)
- Run Monte Carlo simulations to analyze market behavior
- Visualize key metrics like volatility, slippage, and liquidity depth
- Compare different parameter configurations
- Export simulation data for further analysis

## Features

### 🎯 Curve Types
1. **Linear Bonding Curve**: Based on the Solidity implementation with price P(s) = K * s
2. **Exponential Curve**: P(s) = a * e^(b*s) for rapid growth scenarios
3. **Polynomial Curve**: Customizable degree polynomial for flexible curve shapes
4. **Logarithmic Curve**: P(s) = a * ln(s + b) for diminishing returns

### 📊 Key Metrics
- **Volatility**: Price volatility measured as standard deviation of log returns
- **Average Slippage**: Mean price impact across all trades
- **Liquidity Depth**: Percentage of trades with minimal slippage
- **Market Efficiency**: How closely the market follows theoretical predictions
- **Graduation Rate**: Probability of reaching the DEX graduation threshold

### 🎲 Simulation Parameters
- Number of trades
- Average trade size and standard deviation
- Transaction tax rate
- Whale probability and size multiplier
- Graduation threshold
- Initial liquidity settings

## Installation

1. Navigate to the curve_modelling directory:
```bash
cd curve_modelling
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

Run the Streamlit app:
```bash
streamlit run app.py
```

The app will open in your browser at `http://localhost:8501`

## Interface Guide

### Sidebar Configuration
- **Curve Type**: Select the bonding curve model
- **Curve Parameters**: Adjust mathematical parameters for the selected curve
- **Token Configuration**: Set total supply and graduation threshold
- **Transaction Settings**: Configure tax rates
- **Simulation Settings**: Control Monte Carlo parameters

### Main Tabs

1. **📈 Curve Visualization**
   - View the bonding curve shape
   - See cumulative cost to purchase
   - Graduation threshold indicator

2. **🎯 Simulation Results**
   - Run Monte Carlo simulations
   - View summary statistics
   - Price evolution graphs
   - Graduation success rates

3. **📊 Metrics Analysis**
   - Distribution of key metrics
   - Correlation analysis
   - Statistical summaries

4. **🔍 Trade History**
   - Detailed trade-by-trade analysis
   - Export simulation data to CSV
   - Filter and search capabilities

## Understanding the Metrics

### Volatility
Measures price stability. Lower values indicate more stable prices.

### Slippage
The difference between expected and actual trade prices. Lower is better for traders.

### Liquidity Depth Score
Percentage of trades executed with < 1% slippage. Higher scores indicate better liquidity.

### Market Efficiency
How well the market follows theoretical predictions (0-1 scale, higher is better).

## Example Use Cases

1. **Parameter Optimization**: Find the ideal curve parameters for your token launch
2. **Risk Analysis**: Understand volatility and slippage under different market conditions
3. **Graduation Analysis**: Determine the likelihood of reaching DEX graduation
4. **Tax Impact Study**: Analyze how transaction taxes affect market dynamics

## Technical Details

The simulator is based on the BondingCurve.sol contract implementation with:
- SUPPLY: 1 billion tokens
- Linear curve formula: P(s) = K * s / (multiplier * precision)
- Graduation triggers Uniswap V2 pair creation
- 1:1 redemption after graduation

## Contributing

Feel free to extend the simulator with:
- Additional curve types
- New metrics
- Different market scenarios
- Enhanced visualizations
