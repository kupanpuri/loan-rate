export const TARGET_BORROW_ASSETS = ["USDC", "USDT", "USDe"] as const;
export const TARGET_COLLATERAL_ASSETS = ["BTC", "ETH", "SOL", "HYPE"] as const;
export const TARGET_ASSETS = TARGET_BORROW_ASSETS;

export type TargetAsset = (typeof TARGET_ASSETS)[number];

export const UPDATE_TIMES_SAO_PAULO = ["00:00", "06:00", "12:00", "18:00"];

export const CHAINS = {
  ethereum: {
    name: "Ethereum",
    rpcUrls: [
      process.env.ETHEREUM_RPC_URL,
      "https://ethereum.publicnode.com",
      "https://rpc.ankr.com/eth",
      "https://eth.llamarpc.com"
    ].filter(Boolean),
    aavePoolDataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
    aaveUiPoolDataProvider: "0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC",
    aavePoolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e"
  },
  base: {
    name: "Base",
    rpcUrls: [
      process.env.BASE_RPC_URL,
      "https://base.publicnode.com",
      "https://mainnet.base.org",
      "https://base.llamarpc.com"
    ].filter(Boolean),
    aavePoolDataProvider: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
    aaveUiPoolDataProvider: "0x68100bD5345eA474D93577127C11F39FF8463e93",
    aavePoolAddressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D"
  }
} as const;
