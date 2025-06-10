// SPDX-License-Identifier: MIT
// Modified from https://github.com/sourlodine/Pump.fun-Smart-Contract/blob/main/contracts/PumpFun.sol
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "./FFactory.sol";
import "./IFPair.sol";
import "./FRouter.sol";
import "./FERC20.sol";
import "../interfaces/IAgentFactoryV3.sol";
import "../interfaces/IUniswapV2Factory.sol";
import "../interfaces/IUniswapV2Router02.sol";

contract Bonding is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;

    address private _feeTo;

    FFactory public factory;
    FRouter public router;
    uint256 public initialSupply;
    uint256 public fee;
    uint256 public constant K = 3_000_000_000_000;
    uint256 public assetRate;
    uint256 public gradThreshold;
    uint256 public maxTx;
    address public agentFactory;
    
    // Uniswap V2 mainnet addresses
    address public constant UNISWAP_V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    struct Profile {
        address user;
        address[] tokens;
    }

    struct Token {
        address creator;
        address token;
        address pair;
        address uniswapPair;
        address agentToken;
        Data data;
        string description;
        uint8[] cores;
        string image;
        string twitter;
        string telegram;
        string youtube;
        string website;
        bool trading;
        bool tradingOnUniswap;
    }

    struct Data {
        address token;
        string name;
        string _name;
        string ticker;
        uint256 supply;
        uint256 price;
        uint256 marketCap;
        uint256 liquidity;
        uint256 volume;
        uint256 volume24H;
        uint256 prevPrice;
        uint256 lastUpdated;
    }

    struct DeployParams {
        bytes32 tbaSalt;
        address tbaImplementation;
        uint32 daoVotingPeriod;
        uint256 daoThreshold;
    }

    DeployParams private _deployParams;

    mapping(address => Profile) public profile;
    address[] public profiles;

    mapping(address => Token) public tokenInfo;
    address[] public tokenInfos;
    address[] public graduatedTokens;
    
    event Launched(address indexed token, address indexed pair, uint);
    event Deployed(address indexed token, uint256 amount0, uint256 amount1);
    event Graduated(address indexed token);

    error InvalidTokenStatus();
    error InvalidInput();
    error SlippageTooHigh();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address factory_,
        address router_,
        address feeTo_,
        uint256 fee_,
        uint256 initialSupply_,
        uint256 assetRate_,
        uint256 maxTx_,
        address agentFactory_,
        uint256 gradThreshold_
    ) external initializer {
        __ReentrancyGuard_init();
        __Ownable_init(msg.sender);

        factory = FFactory(factory_);
        router = FRouter(router_);

        _feeTo = feeTo_;
        fee = (fee_ * 1 ether) / 1000;

        initialSupply = initialSupply_;
        assetRate = assetRate_;
        maxTx = maxTx_;

        agentFactory = agentFactory_;
        gradThreshold = gradThreshold_;
    }

    function _checkIfProfileExists(address _user) internal view returns (bool) {
        return profile[_user].user == _user;
    }

    function _approval(
        address _spender,
        address _token,
        uint256 amount
    ) internal returns (bool) {
        IERC20(_token).forceApprove(_spender, amount);

        return true;
    }

    function setTokenParams(
        uint256 newSupply,
        uint256 newGradThreshold,
        uint256 newMaxTx,
        uint256 newAssetRate,
        uint256 newFee,
        address newFeeTo
    ) public onlyOwner {
        if (newAssetRate <= 0) {
            revert InvalidInput();
        }
        initialSupply = newSupply;
        gradThreshold = newGradThreshold;
        maxTx = newMaxTx;
        assetRate = newAssetRate;
        fee = newFee;
        _feeTo = newFeeTo;
    }

    function setDeployParams(DeployParams memory params) public onlyOwner {
        _deployParams = params;
    }

    function launch(
        string memory _name,
        string memory _ticker,
        uint8[] memory cores,
        string memory desc,
        string memory img,
        string[4] memory urls,
        uint256 purchaseAmount
    ) public nonReentrant returns (address, address, uint) {
        if (purchaseAmount <= fee || cores.length <= 0) {
            revert InvalidInput();
        }

        address assetToken = router.assetToken();

        uint256 initialPurchase = (purchaseAmount - fee);
        IERC20(assetToken).safeTransferFrom(msg.sender, _feeTo, fee);
        IERC20(assetToken).safeTransferFrom(
            msg.sender,
            address(this),
            initialPurchase
        );

        FERC20 token = new FERC20{
            salt: keccak256(abi.encodePacked(msg.sender, block.timestamp))
        }(string.concat("fun ", _name), _ticker, initialSupply, maxTx);
        uint256 supply = token.totalSupply();

        address _pair = factory.createPair(address(token), assetToken);

        bool approved = _approval(address(router), address(token), supply);
        require(approved);

        uint256 k = ((K * 10000) / assetRate);
        uint256 liquidity = (((k * 10000 ether) / supply) * 1 ether) / 10000;

        router.addInitialLiquidity(address(token), supply, liquidity);

        Data memory _data = Data({
            token: address(token),
            name: string.concat("fun ", _name),
            _name: _name,
            ticker: _ticker,
            supply: supply,
            price: supply / liquidity,
            marketCap: liquidity,
            liquidity: liquidity * 2,
            volume: 0,
            volume24H: 0,
            prevPrice: supply / liquidity,
            lastUpdated: block.timestamp
        });
        Token memory tmpToken = Token({
            creator: msg.sender,
            token: address(token),
            pair: _pair,
            uniswapPair: address(0),
            agentToken: address(0),
            data: _data,
            description: desc,
            cores: cores,
            image: img,
            twitter: urls[0],
            telegram: urls[1],
            youtube: urls[2],
            website: urls[3],
            trading: true, // Can only be traded once creator made initial purchase
            tradingOnUniswap: false
        });
        tokenInfo[address(token)] = tmpToken;
        tokenInfos.push(address(token));

        bool exists = _checkIfProfileExists(msg.sender);

        if (exists) {
            Profile storage _profile = profile[msg.sender];

            _profile.tokens.push(address(token));
        } else {
            Profile storage _profile = profile[msg.sender];
            _profile.user = msg.sender;

            _profile.tokens.push(address(token));
        }

        uint n = tokenInfos.length;

        emit Launched(address(token), _pair, n);

        // Make initial purchase
        IERC20(assetToken).forceApprove(address(router), initialPurchase);
        _buy(
            address(this),
            initialPurchase,
            address(token),
            0,
            block.timestamp + 300
        );
        token.transfer(msg.sender, token.balanceOf(address(this)));

        return (address(token), _pair, n);
    }

    function sell(
        uint256 amountIn,
        address tokenAddress,
        uint256 amountOutMin,
        uint256 deadline
    ) public returns (bool) {
        if (!tokenInfo[tokenAddress].trading) {
            revert InvalidTokenStatus();
        }
        if (block.timestamp > deadline) {
            revert InvalidInput();
        }

        (uint256 amount0In, uint256 amount1Out) = router.sell(
            amountIn,
            tokenAddress,
            msg.sender
        );

        if (amount1Out < amountOutMin) {
            revert SlippageTooHigh();
        }

        uint256 duration = block.timestamp -
            tokenInfo[tokenAddress].data.lastUpdated;

        if (duration > 86400) {
            tokenInfo[tokenAddress].data.lastUpdated = block.timestamp;
        }

        return true;
    }

    function _buy(
        address buyer,
        uint256 amountIn,
        address tokenAddress,
        uint256 amountOutMin,
        uint256 deadline
    ) internal {
        if (block.timestamp > deadline) {
            revert InvalidInput();
        }
        address pairAddress = factory.getPair(
            tokenAddress,
            router.assetToken()
        );

        IFPair pair = IFPair(pairAddress);

        (uint256 reserveA, uint256 reserveB) = pair.getReserves();

        (uint256 amount1In, uint256 amount0Out) = router.buy(
            amountIn,
            tokenAddress,
            buyer
        );

        if (amount0Out < amountOutMin) {
            revert SlippageTooHigh();
        }

        uint256 newReserveA = reserveA - amount0Out;
        uint256 duration = block.timestamp -
            tokenInfo[tokenAddress].data.lastUpdated;


        if (duration > 86400) {
            tokenInfo[tokenAddress].data.lastUpdated = block.timestamp;
        }

        if (newReserveA <= gradThreshold && tokenInfo[tokenAddress].trading) {
            _openTradingOnUniswap(tokenAddress);
        }
    }

    function buy(
        uint256 amountIn,
        address tokenAddress,
        uint256 amountOutMin,
        uint256 deadline
    ) public payable returns (bool) {
        if (!tokenInfo[tokenAddress].trading) {
            revert InvalidTokenStatus();
        }

        // Transfer VIRTUAL tokens from user to bonding contract, then approve router
        address assetToken = router.assetToken();
        IERC20(assetToken).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(assetToken).forceApprove(address(router), amountIn);

        _buy(address(this), amountIn, tokenAddress, amountOutMin, deadline);

        return true;
    }

    function _openTradingOnUniswap(address tokenAddress) private {
        FERC20 token_ = FERC20(tokenAddress);

        Token storage _token = tokenInfo[tokenAddress];

        if (_token.tradingOnUniswap || !_token.trading) {
            revert InvalidTokenStatus();
        }

        _token.trading = false;
        _token.tradingOnUniswap = true;

        // Get remaining balances from bonding curve pair
        address pairAddress = factory.getPair(
            tokenAddress,
            router.assetToken()
        );

        IFPair pair = IFPair(pairAddress);

        uint256 assetBalance = pair.assetBalance();
        uint256 tokenBalance = pair.balance();

        // Graduate from bonding curve
        router.graduate(tokenAddress);
        graduatedTokens.push(tokenAddress);

        // Create Uniswap V2 pair
        address assetToken = router.assetToken();
        IUniswapV2Factory uniswapFactory = IUniswapV2Factory(UNISWAP_V2_FACTORY);
        IUniswapV2Router02 uniswapRouter = IUniswapV2Router02(UNISWAP_V2_ROUTER);

        // Check if pair already exists, if not create it
        address uniswapPair = uniswapFactory.getPair(tokenAddress, assetToken);
        if (uniswapPair == address(0)) {
            uniswapPair = uniswapFactory.createPair(tokenAddress, assetToken);
        }

        // Store the Uniswap pair address
        _token.uniswapPair = uniswapPair;

        // Transfer tokens to this contract and approve router for adding liquidity
        IERC20(assetToken).forceApprove(address(uniswapRouter), assetBalance);
        IERC20(tokenAddress).forceApprove(address(uniswapRouter), tokenBalance);

        // Add liquidity to Uniswap V2
        uniswapRouter.addLiquidity(
            tokenAddress,
            assetToken,
            tokenBalance,
            assetBalance,
            0, // Accept any amount of tokens
            0, // Accept any amount of asset tokens
            address(this), // LP tokens to bonding contract
            block.timestamp + 300 // 5 minute deadline
        );

        // Burn tokens from bonding curve pair
        token_.burnFrom(pairAddress, tokenBalance);

        emit Graduated(tokenAddress);
    }

    function unwrapToken(
        address srcTokenAddress,
        address[] memory accounts
    ) public {
        Token memory info = tokenInfo[srcTokenAddress];
        if (!info.tradingOnUniswap) {
            revert InvalidTokenStatus();
        }

        FERC20 token = FERC20(srcTokenAddress);
        IERC20 agentToken = IERC20(info.agentToken);
        address pairAddress = factory.getPair(
            srcTokenAddress,
            router.assetToken()
        );
        for (uint i = 0; i < accounts.length; i++) {
            address acc = accounts[i];
            uint256 balance = token.balanceOf(acc);
            if (balance > 0) {
                token.burnFrom(acc, balance);
                agentToken.transferFrom(pairAddress, acc, balance);
            }
        }
    }
}
