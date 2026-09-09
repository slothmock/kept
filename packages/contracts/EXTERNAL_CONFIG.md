# Milestone 3 external configuration verification

Checked: 2026-09-09 (BST)

These values are deployment and fork-test configuration, not Product Lead decisions. Reverify every value immediately before deployment.

## Monad and USDC

| Item | Verified value | Official source |
| --- | --- | --- |
| Monad mainnet chain ID | `143` | Monad Network Information: https://docs.monad.xyz/developer-essentials/network-information |
| Public RPC used for the Milestone 3 fork test | `https://rpc3.monad.xyz` | Monad Network Information (rate-limited public endpoint) |
| Circle-issued native Monad USDC | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | Circle USDC contract addresses: https://developers.circle.com/stablecoins/usdc-contract-addresses |
| USDC decimals | `6` | Aave address book `v4.66.4`, `AaveV3MonadAssets.USDC_DECIMALS`; also asserted against the live token in the fork test |

## Aave V3 Monad

Pinned address-book dependency: `aave-dao/aave-address-book` tag `v4.66.4`, commit `09a66451e85dfaf056d2ce16fb1f226f3bd0dcd9`.

| Item | Verified value |
| --- | --- |
| PoolAddressesProvider | `0x34793Fb9935F7bB5E5aE920fb963F39063E7A615` |
| Pool | `0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef` |
| USDC aToken | `0x35a73BAcb179d3740395A3ceCc87FF2e581d6042` |
| aToken underlying | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |

Sources:

- Pinned generated address book: `lib/aave-address-book/src/AaveV3Monad.sol`
- Aave deployed-address dashboard: https://aave.com/docs/resources/addresses
- Aave V3 Pool documentation: https://aave.com/docs/aave-v3/smart-contracts/pool
- Aave V3 Origin release `v3.7.0`: https://github.com/aave-dao/aave-v3-origin/releases/tag/v3.7.0

The local minimal `IAavePool` and `IAaveAToken` interfaces are pinned semantically to Aave V3 Origin `v3.7.0` (tag commit `cff15de6d1271b0c800fc001f4aea4c263e8a597`). The full Origin repository cannot be checked out on this Windows filesystem because its tagged tree contains a path component named `aux`, which Windows reserves. The implementation therefore exposes only the frozen `supply`, `withdraw`, `UNDERLYING_ASSET_ADDRESS`, and `balanceOf` selectors rather than importing a broader interface surface.

Verified behavior:

- `supply(asset, amount, onBehalfOf, referralCode)` transfers the supplied asset and mints the corresponding aToken position to `onBehalfOf`.
- `withdraw(asset, amount, to)` burns the caller's corresponding aToken position, sends underlying to `to`, and returns the amount withdrawn.
- Aave withdrawal remains dependent on unborrowed reserve liquidity. The strategy's `availableLiquidity()` is advisory and uses underlying USDC held at the aToken, bounded by the strategy's aToken position, plus idle strategy USDC. Aave's virtual-underlying accounting can make some physical aToken cash non-withdrawable, so this value reduces avoidable failures but never guarantees withdrawal; the strategy still uses exact-or-revert execution.
- The 2026-09-09 Monad fork test asserted provider-to-Pool resolution, bytecode, six decimals, aToken underlying, actual supply, partial withdrawal, and final vault redemption.

## Solidity and libraries

| Dependency | Pin | Reason |
| --- | --- | --- |
| Foundry | `v1.8.1` (`982849d3140c01fd3b72905759581a132df7aa98`) | Required Solidity build, unit, fuzz, invariant, and Monad-network fork runner |
| Solidity | `0.8.30` | Repository compiler pin |
| OpenZeppelin Contracts | audited npm `latest` `v5.6.1` (`5fd1781b1454fd1ef8e722282f86f9293cacf256`) | ERC-4626/ERC-20, SafeERC20, Math.mulDiv, Ownable2Step, AccessControl, and Pausable |
| Aave address book | `v4.66.4` (`09a66451e85dfaf056d2ce16fb1f226f3bd0dcd9`) | Current Monad deployment configuration |
| forge-std | `v1.16.2` (`bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`) | Foundry test utilities and invariant handlers |

OpenZeppelin distinguishes audited releases through the npm `latest` tag and unaudited finalized releases through `dev`; on the check date, npm `latest` resolved to `5.6.1`, while GitHub `v5.7.0` corresponded to the npm `dev` line. Source: https://docs.openzeppelin.com/contracts/5.x

## Deployment revalidation gate

Before any deployment:

1. recheck Monad chain ID and selected RPC;
2. recheck Circle's canonical Monad USDC address;
3. recheck the current Aave address-book release and all four Aave/USDC addresses;
4. assert Pool and aToken bytecode exists;
5. assert PoolAddressesProvider resolves the configured Pool;
6. assert USDC decimals are six and aToken underlying equals USDC;
7. rerun the Monad fork supply/withdraw test against a current block;
8. review current reserve status and available liquidity;
9. recheck OpenZeppelin's audited npm `latest` tag.
