import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from dataclasses import dataclass
from typing import List, Tuple, Dict
import random
from datetime import datetime

# Import our modules
from bonding_curves import LinearBondingCurve, ExponentialBondingCurve, PolynomialBondingCurve, LogarithmicBondingCurve
from simulation import SimulationEngine, Trade, SimulationResult
from metrics import calculate_metrics

# Page config
st.set_page_config(
    page_title="Bonding Curve Simulator",
    page_icon="📈",
    layout="wide"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main > div {
        padding-top: 2rem;
    }
    .stTabs [data-baseweb="tab-list"] button {
        font-size: 1.1rem;
        padding: 0.5rem 1rem;
    }
    .metric-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        margin-bottom: 1rem;
    }
</style>
""", unsafe_allow_html=True)

# Title and description
st.title("🚀 Bonding Curve Simulator")
st.markdown("""
This simulator allows you to explore different bonding curve models and analyze their behavior under various market conditions.
Model different curve types, run Monte Carlo simulations, and visualize key metrics.
""")

# Sidebar for parameters
st.sidebar.header("⚙️ Configuration")

# Curve type selection
curve_type = st.sidebar.selectbox(
    "Select Bonding Curve Type",
    ["Linear", "Exponential", "Polynomial", "Logarithmic"],
    help="Choose the mathematical model for your bonding curve"
)

# Curve parameters
st.sidebar.subheader("📊 Curve Parameters")

if curve_type == "Linear":
    k_value = st.sidebar.slider(
        "Slope Constant (K)",
        min_value=0.1,
        max_value=10.0,
        value=2.0,
        step=0.1,
        help="Controls the steepness of the linear curve"
    )
    multiplier = st.sidebar.number_input(
        "Price Multiplier",
        min_value=100000,
        max_value=100000000,
        value=10000000,
        step=100000,
        help="Scales the price calculation"
    )
    curve_params = {"k": k_value, "multiplier": multiplier}
elif curve_type == "Exponential":
    a_value = st.sidebar.slider("Base (a)", 0.01, 1.0, 0.1, 0.01)
    b_value = st.sidebar.slider("Growth Rate (b)", 0.0001, 0.01, 0.001, 0.0001)
    curve_params = {"a": a_value, "b": b_value}
elif curve_type == "Polynomial":
    degree = st.sidebar.slider("Degree", 2, 4, 2)
    coefficients = []
    for i in range(degree + 1):
        coef = st.sidebar.number_input(f"Coefficient x^{i}", value=0.1 if i > 0 else 1.0, format="%.4f")
        coefficients.append(coef)
    curve_params = {"coefficients": coefficients}
else:  # Logarithmic
    a_value = st.sidebar.slider("Scale (a)", 0.1, 10.0, 1.0, 0.1)
    b_value = st.sidebar.slider("Shift (b)", 1.0, 100.0, 10.0, 1.0)
    curve_params = {"a": a_value, "b": b_value}

# Token parameters
st.sidebar.subheader("🪙 Token Configuration")
total_supply = st.sidebar.number_input(
    "Total Supply",
    min_value=1_000_000,
    max_value=10_000_000_000,
    value=1_000_000_000,
    step=1_000_000,
    help="Total token supply"
)

graduation_threshold = st.sidebar.number_input(
    "Graduation Threshold (VIRTUAL)",
    min_value=100,
    max_value=1_000_000,
    value=10_000,
    step=100,
    help="Amount of VIRTUAL needed to graduate to DEX"
)

# Transaction parameters
st.sidebar.subheader("💸 Transaction Settings")
tax_rate = st.sidebar.slider(
    "Transaction Tax (%)",
    min_value=0.0,
    max_value=10.0,
    value=0.0,
    step=0.1,
    help="Tax applied to each transaction"
) / 100

# Simulation parameters
st.sidebar.subheader("🎲 Simulation Settings")
num_trades = st.sidebar.slider(
    "Number of Trades",
    min_value=100,
    max_value=10000,
    value=1000,
    step=100,
    help="Number of trades to simulate"
)

num_simulations = st.sidebar.slider(
    "Monte Carlo Runs",
    min_value=1,
    max_value=100,
    value=10,
    step=1,
    help="Number of simulation runs"
)

avg_trade_size = st.sidebar.number_input(
    "Average Trade Size (VIRTUAL)",
    min_value=1,
    max_value=1000,
    value=50,
    step=1,
    help="Average size of trades in VIRTUAL"
)

trade_size_std = st.sidebar.number_input(
    "Trade Size Std Dev",
    min_value=0.1,
    max_value=100.0,
    value=20.0,
    step=0.1,
    help="Standard deviation of trade sizes"
)

sell_probability = st.sidebar.slider(
    "Sell Probability (%)",
    min_value=0,
    max_value=50,
    value=20,
    step=1,
    help="Probability that a trade will be a sell order"
) / 100

whale_probability = st.sidebar.slider(
    "Whale Trade Probability (%)",
    min_value=0,
    max_value=20,
    value=5,
    step=1,
    help="Probability of a large whale trade"
) / 100

# Initialize curve based on selection
if curve_type == "Linear":
    curve = LinearBondingCurve(total_supply, graduation_threshold, **curve_params)
elif curve_type == "Exponential":
    curve = ExponentialBondingCurve(total_supply, graduation_threshold, **curve_params)
elif curve_type == "Polynomial":
    curve = PolynomialBondingCurve(total_supply, graduation_threshold, **curve_params)
else:
    curve = LogarithmicBondingCurve(total_supply, graduation_threshold, **curve_params)

# Main content area
tab1, tab2, tab3, tab4 = st.tabs(["📈 Curve Visualization", "🎯 Simulation Results", "📊 Metrics Analysis", "🔍 Trade History"])

with tab1:
    st.header("Bonding Curve Visualization")
    
    col1, col2 = st.columns(2)
    
    with col1:
        # Plot the bonding curve
        supply_range = np.linspace(0, total_supply, 1000)
        prices = [curve.get_price(s) for s in supply_range]
        
        fig_curve = go.Figure()
        fig_curve.add_trace(go.Scatter(
            x=supply_range / 1e9,  # Convert to billions
            y=prices,
            mode='lines',
            name='Price Curve',
            line=dict(color='#1f77b4', width=3)
        ))
        
        fig_curve.update_layout(
            title=f"{curve_type} Bonding Curve",
            xaxis_title="Token Supply (Billions)",
            yaxis_title="Price (VIRTUAL per Token)",
            height=400,
            template="plotly_white"
        )
        
        st.plotly_chart(fig_curve, use_container_width=True)
    
    with col2:
        # Plot the cumulative cost
        costs = [curve.calculate_cost(0, s) for s in supply_range]
        
        fig_cost = go.Figure()
        fig_cost.add_trace(go.Scatter(
            x=supply_range / 1e9,
            y=costs,
            mode='lines',
            name='Cumulative Cost',
            line=dict(color='#ff7f0e', width=3)
        ))
        
        # Add graduation threshold line
        fig_cost.add_hline(
            y=graduation_threshold,
            line_dash="dash",
            line_color="red",
            annotation_text="Graduation Threshold"
        )
        
        fig_cost.update_layout(
            title="Cumulative Cost to Purchase",
            xaxis_title="Token Supply (Billions)",
            yaxis_title="Total Cost (VIRTUAL)",
            height=400,
            template="plotly_white"
        )
        
        st.plotly_chart(fig_cost, use_container_width=True)

with tab2:
    st.header("Monte Carlo Simulation Results")
    
    if st.button("🚀 Run Simulations", type="primary"):
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        # Run simulations
        engine = SimulationEngine(curve, tax_rate)
        all_results = []
        
        for sim_idx in range(num_simulations):
            status_text.text(f"Running simulation {sim_idx + 1}/{num_simulations}...")
            progress_bar.progress((sim_idx + 1) / num_simulations)
            
            result = engine.run_simulation(
                num_trades=num_trades,
                avg_trade_size=avg_trade_size,
                trade_size_std=trade_size_std,
                sell_probability=sell_probability,
                whale_probability=whale_probability
            )
            all_results.append(result)
        
        status_text.text("Simulations complete! ✅")
        
        # Store results in session state
        st.session_state['simulation_results'] = all_results
        st.session_state['curve'] = curve
        
    # Display results if available
    if 'simulation_results' in st.session_state:
        results = st.session_state['simulation_results']
        
        # Summary statistics
        st.subheader("📊 Summary Statistics Across All Simulations")
        
        col1, col2, col3, col4 = st.columns(4)
        
        graduated_count = sum(1 for r in results if r.graduated)
        avg_final_price = np.mean([r.final_price for r in results])
        avg_total_volume = np.mean([r.total_volume for r in results])
        avg_virtual_raised = np.mean([r.final_virtual_raised for r in results])
        
        with col1:
            st.metric(
                "Graduation Rate",
                f"{graduated_count}/{num_simulations}",
                f"{graduated_count/num_simulations*100:.1f}%"
            )
        
        with col2:
            initial_price = curve.get_price(0)
            if initial_price > 0:
                price_change_pct = f"{(avg_final_price/initial_price - 1)*100:.1f}% vs initial"
            else:
                price_change_pct = "N/A (initial price = 0)"
            
            st.metric(
                "Avg Final Price",
                f"{avg_final_price:.6f}",
                price_change_pct
            )
        
        with col3:
            st.metric(
                "Avg Volume",
                f"{avg_total_volume:.0f}",
                "VIRTUAL traded"
            )
        
        with col4:
            st.metric(
                "Avg Raised",
                f"{avg_virtual_raised:.0f}",
                f"{avg_virtual_raised/graduation_threshold*100:.1f}% of threshold"
            )
        
        # Price evolution across simulations
        st.subheader("💹 Price Evolution")
        
        fig_price_evolution = go.Figure()
        
        for idx, result in enumerate(results):
            price_history = [trade.price for trade in result.trades]
            fig_price_evolution.add_trace(go.Scatter(
                x=list(range(len(price_history))),
                y=price_history,
                mode='lines',
                name=f'Sim {idx+1}',
                opacity=0.3 if num_simulations > 10 else 0.7,
                showlegend=num_simulations <= 10
            ))
        
        fig_price_evolution.update_layout(
            title="Price Evolution Across Simulations",
            xaxis_title="Trade Number",
            yaxis_title="Price (VIRTUAL per Token)",
            height=500,
            template="plotly_white"
        )
        
        st.plotly_chart(fig_price_evolution, use_container_width=True)

with tab3:
    st.header("Metrics Analysis")
    
    if 'simulation_results' in st.session_state:
        results = st.session_state['simulation_results']
        
        # Calculate metrics for each simulation
        all_metrics = []
        for result in results:
            metrics = calculate_metrics(result)
            all_metrics.append(metrics)
        
        # Display average metrics
        st.subheader("📈 Average Metrics Across Simulations")
        
        col1, col2 = st.columns(2)
        
        with col1:
            avg_volatility = np.mean([m['volatility'] for m in all_metrics])
            avg_slippage = np.mean([m['avg_slippage'] for m in all_metrics])
            avg_liquidity_depth = np.mean([m['liquidity_depth'] for m in all_metrics])
            
            st.metric("Average Volatility", f"{avg_volatility:.4f}")
            st.metric("Average Slippage", f"{avg_slippage:.2%}")
            st.metric("Liquidity Depth Score", f"{avg_liquidity_depth:.2f}")
        
        with col2:
            avg_price_impact = np.mean([m['price_impact'] for m in all_metrics])
            avg_efficiency = np.mean([m['market_efficiency'] for m in all_metrics])
            
            st.metric("Average Price Impact", f"{avg_price_impact:.2%}")
            st.metric("Market Efficiency", f"{avg_efficiency:.2%}")
        
        # Distribution plots
        st.subheader("📊 Metric Distributions")
        
        fig_distributions = make_subplots(
            rows=2, cols=2,
            subplot_titles=("Volatility", "Slippage", "Price Impact", "Market Efficiency")
        )
        
        fig_distributions.add_trace(
            go.Histogram(x=[m['volatility'] for m in all_metrics], name="Volatility", nbinsx=20),
            row=1, col=1
        )
        
        fig_distributions.add_trace(
            go.Histogram(x=[m['avg_slippage'] for m in all_metrics], name="Slippage", nbinsx=20),
            row=1, col=2
        )
        
        fig_distributions.add_trace(
            go.Histogram(x=[m['price_impact'] for m in all_metrics], name="Price Impact", nbinsx=20),
            row=2, col=1
        )
        
        fig_distributions.add_trace(
            go.Histogram(x=[m['market_efficiency'] for m in all_metrics], name="Efficiency", nbinsx=20),
            row=2, col=2
        )
        
        fig_distributions.update_layout(height=600, showlegend=False, template="plotly_white")
        st.plotly_chart(fig_distributions, use_container_width=True)
        
        # Correlation analysis
        st.subheader("🔗 Metric Correlations")
        
        metrics_df = pd.DataFrame(all_metrics)
        correlation_matrix = metrics_df.corr()
        
        fig_corr = px.imshow(
            correlation_matrix,
            labels=dict(color="Correlation"),
            x=correlation_matrix.columns,
            y=correlation_matrix.columns,
            color_continuous_scale="RdBu_r",
            aspect="auto"
        )
        
        fig_corr.update_layout(title="Correlation Heatmap", height=500)
        st.plotly_chart(fig_corr, use_container_width=True)
    else:
        st.info("👆 Run simulations first to see metrics analysis")

with tab4:
    st.header("Trade History Analysis")
    
    if 'simulation_results' in st.session_state:
        # Select which simulation to analyze
        sim_idx = st.selectbox(
            "Select Simulation Run",
            range(len(st.session_state['simulation_results'])),
            format_func=lambda x: f"Simulation {x+1}"
        )
        
        result = st.session_state['simulation_results'][sim_idx]
        
        # Create trade history dataframe
        trade_data = []
        for i, trade in enumerate(result.trades):
            trade_data.append({
                'Trade #': i + 1,
                'Type': trade.trade_type,
                'VIRTUAL Amount': trade.virtual_amount,
                'Tokens': trade.token_amount,
                'Price': trade.price,
                'Slippage': trade.slippage,
                'Total Supply': trade.total_supply,
                'Virtual Raised': trade.virtual_raised
            })
        
        df_trades = pd.DataFrame(trade_data)
        
        # Summary stats for this simulation
        st.subheader("📊 Simulation Summary")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.metric("Total Trades", len(result.trades))
            st.metric("Graduated", "Yes ✅" if result.graduated else "No ❌")
        
        with col2:
            st.metric("Final Price", f"{result.final_price:.6f}")
            st.metric("Total Volume", f"{result.total_volume:.0f}")
        
        with col3:
            st.metric("Virtual Raised", f"{result.final_virtual_raised:.0f}")
            st.metric("Tokens Sold", f"{result.final_tokens_sold/1e6:.1f}M")
        
        # Interactive trade history
        st.subheader("📜 Detailed Trade History")
        
        # Add filters
        col1, col2 = st.columns(2)
        with col1:
            min_size = st.number_input("Min Trade Size", value=0.0)
        with col2:
            max_size = st.number_input("Max Trade Size", value=float(df_trades['VIRTUAL Amount'].max()))
        
        # Filter dataframe
        filtered_df = df_trades[
            (df_trades['VIRTUAL Amount'] >= min_size) & 
            (df_trades['VIRTUAL Amount'] <= max_size)
        ]
        
        # Display dataframe
        st.dataframe(
            filtered_df,
            use_container_width=True,
            height=400,
            column_config={
                "Price": st.column_config.NumberColumn(format="%.6f"),
                "Slippage": st.column_config.NumberColumn(format="%.2%"),
                "VIRTUAL Amount": st.column_config.NumberColumn(format="%.2f"),
                "Tokens": st.column_config.NumberColumn(format="%.2f"),
                "Total Supply": st.column_config.NumberColumn(format="%.0f"),
                "Virtual Raised": st.column_config.NumberColumn(format="%.2f")
            }
        )
        
        # Download button
        csv = df_trades.to_csv(index=False)
        st.download_button(
            label="📥 Download Trade History CSV",
            data=csv,
            file_name=f"trades_simulation_{sim_idx+1}.csv",
            mime="text/csv"
        )
    else:
        st.info("👆 Run simulations first to see trade history")

# Footer
st.markdown("---")
st.markdown("""
<div style='text-align: center'>
    <p>Built with Streamlit | Bonding Curve Simulator v1.0</p>
</div>
""", unsafe_allow_html=True) 