# On-chain facts shown in the trailer (all real, Avalanche Fuji testnet)

Read from testnet.snowtrace.io on 2026-11-20 (YARN token page 0x3ae1b898c1Ded263b30D968D26Fe65211f102d6b).
Every number on screen in the economy section comes from this list. Re-check before final export.

| What | Method | Amount | Block | Tx |
|---|---|---|---|---|
| Genesis supply (fixed, no mint function) | Transfer from 0x0 | 1,000,000,000 YARN | 60931271 | 0x42cdaae9a91984232225e6b9a57ce22447cae526703ad17eadc6e0ce8bc3a049 |
| Gear seal burns YARN | `seal(bytes32 intent, uint256 amount)` | 2 YARN to 0x000…000 | 60934486 | 0xdcd5ced176a2e9fa7febf08046d9c6681fb99c9f38a5681a9e6113b04d80e53f |
| Relic Market sale (RelicMarketV2 0x6Fe4…7eb4) | `buy(uint256 id)` | 1.23456 YARN to seller, 0.0246913 YARN burned (2% fee burn) | 60934503 | 0xb0240565a3912c17eefc441bb9787f633fa28105064618400fc71c800120b273 |
| Total supply after burns | token overview | 999,999,997.975308642 YARN | - | - |

Contracts (packages/chain/deployments/43113.json): YarnToken 0x3ae1b898c1Ded263b30D968D26Fe65211f102d6b,
RelicNFT 0xB1a1edb7A75Db6e7067E747ddee32B39c2296f2D, RelicMarketV2 0x6Fe415494D791E63d87613B8FBCdbb24743C7eb4.

Testnet only: YARN and NFTs have no real-world value. The trailer never states or implies earnings.

Also confirmed by the Avalanche thread (docs/avalanche/LIVE-E2E.md, PR #448):
- Relic mint from a server voucher (19 Nov): 0x0fc6ef874ac73420f4fe1be9dbc17cabb1bda081d09733b5b74595985f8e9ee9
- Market listing #4 (19 Nov, still open): 0xefe712af32bfc68f18ef24be6b7180ff59a673e9db880172ed336b8fc8e6c5e8
- Market sale (12 Nov): buy 0x9662228f168bd5080907f49bd3a01d735f91b620d5468c7778a362b74ec7fddd, withdraw 0x08d34c5a…e696
Burn check: 1,000,000,000 − 999,999,997.975308642 = 2.024691358 YARN = 2 (seal) + 0.0246913 (sale fee burn).

## Live end-to-end run, 21 Nov 2026 (after the café wallet was funded)

From PR #469 (`docs/avalanche/live-e2e-2026-11-21.json`), all on Fuji (chain 43113), RelicMarketV2 `0x6Fe4…eb4`:

| Step | Tx |
|---|---|
| Café gas (guest-drip) | `0x75b9639f85fd0b86eb435a53cecb1dc13b1312377208a18d001995d8dc6cf644` |
| RelicNFT.mint (server voucher) | `0x90a79ef39aa2f77c2f96396b7364d39d91d7c886f94cf413089fb93643391a61` |
| List #5 at 0.001 AVAX | `0xc9bbd0a6e649a6c4a4a7f1c689c0d72457201fef2e96c7ecb9600b699cb60b4f` |
| Buy | `0xb16588ad63b85922f9233205c05b075aff0e3a894204c1101f6c0eb8d07e16c9` |
| Withdraw | `0x762c833b4ff4979e4679154648602717939008402835734ed27a12b2bcd51176` |

The sale fee was 5% (0.00005 AVAX): 40% of it burned (0.00002 AVAX) and 60% to treasury. AVAX listings burn AVAX,
not YARN, so VO line 10 now says "Seals burn YARN … and every sale burns part of its fee" (true for YARN and AVAX
listings alike). It no longer claims payouts are paced to burns.
