import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import math

st.set_page_config(
    page_title="Bonding Curve Explorer",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

def calculate_purchase_return(supply, reserve_balance, reserve_ratio, deposit_amount):
    """
    Calculate the number of tokens returned for a given deposit amount.
    Based on Bancor Formula: Return = supply * ((1 + deposit/reserve) ^ reserve_ratio - 1)
    """
    if deposit_amount == 0:
        return 0
    
    if reserve_ratio == 1.0:  # Special case for 100% reserve ratio
        return supply * deposit_amount / reserve_balance
    
    return supply * (((1 + deposit_amount / reserve_balance) ** reserve_ratio) - 1)

def calculate_sale_return(supply, reserve_balance, reserve_ratio, sell_amount):
    """
    Calculate the reserve tokens returned for selling a given amount of continuous tokens.
    Based on Bancor Formula: Return = reserve * (1 - (1 - sell_amount/supply) ^ (1/reserve_ratio))
    """
    if sell_amount == 0:
        return 0
    
    if sell_amount == supply:
        return reserve_balance
    
    if reserve_ratio == 1.0:  # Special case for 100% reserve ratio
        return reserve_balance * sell_amount / supply
    
    return reserve_balance * (1 - ((1 - sell_amount / supply) ** (1 / reserve_ratio)))

def calculate_current_price(supply, reserve_balance, reserve_ratio):
    """
    Calculate current price: Price = Reserve Balance / (Supply * Reserve Ratio)
    """
    if supply == 0:
        return 0
    return reserve_balance / (supply * reserve_ratio)

def generate_bonding_curve_data(reserve_ratio, max_supply=1000, initial_supply=1, slope=0.001):
    """
    Generate proper bonding curve data based on different reserve ratios.
    Uses power law: price = slope * (supply ^ (1/reserve_ratio - 1))
    """
    supplies = np.linspace(initial_supply, max_supply, 500)
    prices = []
    
    # Convert reserve ratio to curve exponent
    if reserve_ratio == 1.0:
        # Linear curve for 100% reserve ratio
        exponent = 0
    else:
        exponent = (1 / reserve_ratio) - 1
    
    for supply in supplies:
        if reserve_ratio == 1.0:
            # Linear relationship for 100% reserve ratio
            price = slope
        else:
            # Power law relationship
            price = slope * (supply ** exponent)
        prices.append(price)
    
    return supplies, np.array(prices)

def generate_market_cap_curve(supplies, prices):
    """Generate market cap data points from supply and price data."""
    return supplies * prices

def get_reserve_ratio_examples():
    """Get example curves for different reserve ratios as mentioned in the article."""
    examples = {
        0.1: "f(x) = mx^9 (Very steep)",
        0.2: "f(x) = mx^4 (Steep)", 
        0.5: "f(x) = mx (Linear)",
        0.9: "f(x) = mx^(1/9) (Gentle)",
        1.0: "f(x) = m (Constant)"
    }
    return examples

# Main App
st.title("🔗 Bonding Curve Explorer")
st.markdown("""
Explore the mathematical relationships between token supply, price, and reserve ratios in bonding curve mechanisms.
Based on the Bancor Formula and concepts from continuous token economics.
""")

# Sidebar for parameters
st.sidebar.header("📊 Curve Parameters")

# Reserve Ratio slider
reserve_ratio = st.sidebar.slider(
    "Reserve Ratio", 
    min_value=0.1, 
    max_value=1.0, 
    value=0.5, 
    step=0.05,
    help="Lower ratios create steeper curves with higher price sensitivity"
)

# Price slope multiplier
slope = st.sidebar.slider(
    "Price Slope Multiplier", 
    min_value=0.0001, 
    max_value=0.01, 
    value=0.001, 
    step=0.0001,
    format="%.4f",
    help="Controls the base price level of the curve"
)

# Initial values for calculations
initial_supply = st.sidebar.number_input(
    "Initial Token Supply", 
    min_value=1.0, 
    max_value=100000.0, 
    value=100.0, 
    step=10.0
)

initial_reserve = st.sidebar.number_input(
    "Initial Reserve Balance (ETH)", 
    min_value=1.0, 
    max_value=100000.0, 
    value=100.0, 
    step=10.0
)

# Max supply for visualization
max_supply = st.sidebar.number_input(
    "Max Supply (for visualization)", 
    min_value=100.0, 
    max_value=100000.0, 
    value=1000.0, 
    step=100.0
)

# Create columns for main content
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("📈 Bonding Curve Visualization")
    
    # Generate curve data
    supplies, prices = generate_bonding_curve_data(reserve_ratio, max_supply, 1, slope)
    market_caps = generate_market_cap_curve(supplies, prices)
    
    # Create subplots
    fig = make_subplots(
        rows=2, cols=1,
        subplot_titles=('Token Price vs Supply', 'Market Cap vs Supply'),
        vertical_spacing=0.15
    )
    
    # Price curve
    fig.add_trace(
        go.Scatter(
            x=supplies, 
            y=prices, 
            mode='lines',
            name=f'Reserve Ratio: {reserve_ratio}',
            line=dict(color='#1f77b4', width=3)
        ),
        row=1, col=1
    )
    
    # Market cap curve
    fig.add_trace(
        go.Scatter(
            x=supplies, 
            y=market_caps, 
            mode='lines',
            name='Market Cap',
            line=dict(color='#ff7f0e', width=3),
            showlegend=False
        ),
        row=2, col=1
    )
    
    # Current position marker
    current_price_at_supply = slope * (initial_supply ** ((1/reserve_ratio) - 1)) if reserve_ratio != 1.0 else slope
    current_market_cap = initial_supply * current_price_at_supply
    
    fig.add_trace(
        go.Scatter(
            x=[initial_supply], 
            y=[current_price_at_supply],
            mode='markers',
            name='Current Position',
            marker=dict(color='red', size=10),
            showlegend=False
        ),
        row=1, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=[initial_supply], 
            y=[current_market_cap],
            mode='markers',
            name='Current Market Cap',
            marker=dict(color='red', size=10),
            showlegend=False
        ),
        row=2, col=1
    )
    
    fig.update_layout(height=600, showlegend=True)
    fig.update_xaxes(title_text="Token Supply", row=1, col=1)
    fig.update_xaxes(title_text="Token Supply", row=2, col=1)
    fig.update_yaxes(title_text="Price (ETH)", row=1, col=1)
    fig.update_yaxes(title_text="Market Cap (ETH)", row=2, col=1)
    
    st.plotly_chart(fig, use_container_width=True)

with col2:
    st.subheader("💰 Current Metrics")
    
    # Calculate current metrics using the Bancor formula for actual trading
    current_price = calculate_current_price(initial_supply, initial_reserve, reserve_ratio)
    current_market_cap_bancor = initial_supply * current_price
    
    # Display current metrics
    st.metric("Current Price", f"{current_price:.6f} ETH")
    st.metric("Market Cap", f"{current_market_cap_bancor:.2f} ETH")
    st.metric("Reserve Ratio", f"{reserve_ratio:.1%}")
    st.metric("Price Sensitivity", "High" if reserve_ratio < 0.3 else "Medium" if reserve_ratio < 0.7 else "Low")
    
    # Show the mathematical relationship
    examples = get_reserve_ratio_examples()
    if reserve_ratio in examples:
        st.info(f"**Curve Type:** {examples[reserve_ratio]}")

# Trading Simulator Section
st.subheader("🔄 Trading Simulator")

col3, col4 = st.columns(2)

with col3:
    st.write("**Buy Tokens**")
    eth_to_spend = st.number_input(
        "ETH to spend", 
        min_value=0.01, 
        max_value=float(initial_reserve), 
        value=1.0, 
        step=0.01
    )
    
    if eth_to_spend > 0:
        tokens_received = calculate_purchase_return(
            initial_supply, initial_reserve, reserve_ratio, eth_to_spend
        )
        new_supply = initial_supply + tokens_received
        new_reserve = initial_reserve + eth_to_spend
        new_price = calculate_current_price(new_supply, new_reserve, reserve_ratio)
        
        st.write(f"**Tokens received:** {tokens_received:.4f}")
        st.write(f"**New price:** {new_price:.6f} ETH")
        if current_price > 0:
            st.write(f"**Price impact:** {((new_price/current_price - 1) * 100):.2f}%")

with col4:
    st.write("**Sell Tokens**")
    tokens_to_sell = st.number_input(
        "Tokens to sell", 
        min_value=0.01, 
        max_value=float(initial_supply * 0.99), 
        value=1.0, 
        step=0.01
    )
    
    if tokens_to_sell > 0 and tokens_to_sell < initial_supply:
        eth_received = calculate_sale_return(
            initial_supply, initial_reserve, reserve_ratio, tokens_to_sell
        )
        new_supply = initial_supply - tokens_to_sell
        new_reserve = initial_reserve - eth_received
        new_price = calculate_current_price(new_supply, new_reserve, reserve_ratio)
        
        st.write(f"**ETH received:** {eth_received:.4f}")
        st.write(f"**New price:** {new_price:.6f} ETH")
        if current_price > 0:
            st.write(f"**Price impact:** {((new_price/current_price - 1) * 100):.2f}%")

st.link_button("Based on this awesome article", "https://yos.io/2018/11/10/bonding-curves/")
