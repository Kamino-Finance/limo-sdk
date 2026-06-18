## Installation

```shell
# npm
npm install @kamino-finance/limo-sdk

# yarn
yarn add @kamino-finance/limo-sdk
```

**How to use the Limo SDK:**

- `LimoClient` - should be initialised and then called for all operations as well as fetching on-chain data

```ts
import { LimoClient } from "@kamino-finance/limo-sdk";

const limoClient = new LimoClient(env.conn, globalConfigPk);
```

## Migration note

**Breaking change in 3.0.0:** client codegen moved to
[Codama](https://github.com/codama-idl/codama) (run via `yarn codegen`).
`LimoClient` remains the supported API. The hand-written
`rpc_client/instructions/*` builders were removed — both the deep import paths
and the root named exports (`takeOrder`, `createOrder`, `flashTakeOrderStart`,
etc.). Build instructions through `LimoClient` instead. The Codama-generated
tree under `rpc_client/generated` is an internal codegen artifact consumed by
the wrapper and is not re-exported from the package root.