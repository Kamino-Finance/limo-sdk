import { fetchMaybeOrder, Order } from "../rpc_client/generated/accounts";
import { green, initializeClient, red } from "./utils";
import {
  amountToLamportsBN,
  getLimoProgramId,
  getMintDecimals,
  lamportsToAmountDecimal,
  OrderStatus,
  SolanaKitFilter,
} from "../utils";
import { LimoClient } from "../Limo";
import Decimal from "decimal.js";
import fs from "fs";
import { Address, address } from "@solana/kit";
import { Base58EncodedBytes } from "@solana/kit/dist/types";
import { BN } from "@coral-xyz/anchor/dist/cjs";

export async function listOrders(
  quoteToken: string | undefined,
  baseToken: string | undefined,
  filterOutRemainingLamportsAmountBaseToken: string | undefined,
  filterOutRemainingLamportsAmountQuoteToken: string | undefined,
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;

  const filterOutBaseDecimalAmount = filterOutRemainingLamportsAmountBaseToken
    ? new Decimal(filterOutRemainingLamportsAmountBaseToken)
    : new Decimal(0);
  const filterOutQuoteDecimalAmount = filterOutRemainingLamportsAmountQuoteToken
    ? new Decimal(filterOutRemainingLamportsAmountQuoteToken)
    : new Decimal(0);

  let quote = address((quoteToken ?? process.env.QUOTE_TOKEN)!);
  let base = address((baseToken ?? process.env.BASE_TOKEN)!);

  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  let bidOrders = await getOrders(client, base, quote);
  let askOrders = await getOrders(client, quote, base);

  let mints = new Set<string>();
  for (let [order, _] of [...bidOrders, ...askOrders]) {
    mints.add(order.inputMint.toString());
    mints.add(order.outputMint.toString());
  }
  let decimalsMap: Map<string, number> = new Map();

  for (let mint of mints) {
    let decimals = await getMintDecimals(env.rpc, address(mint));
    decimalsMap.set(mint, decimals);
  }

  let bidOrdersFormatted: {
    price: Decimal;
    quoteUiAmount: Decimal;
    baseUiAmount: Decimal;
    quoteDisplay: string;
    baseDisplay: string;
    orderAddress: Address;
  }[] = [];

  let askOrdersFormatted: {
    price: Decimal;
    quoteUiAmount: Decimal;
    baseUiAmount: Decimal;
    quoteDisplay: string;
    baseDisplay: string;
    orderAddress: Address;
  }[] = [];

  for (let [order, orderAddress] of askOrders) {
    // TODO: remove this, temporary until smart contracts fixed
    if (order.initialInputAmount === 0n) {
      continue;
    }

    let quoteAmount = new Decimal(order.initialInputAmount.toString());
    let baseAmount = new Decimal(order.expectedOutputAmount.toString());

    let quoteToken = order.inputMint.toString();
    let baseToken = order.outputMint.toString();

    let quoteDecimals = decimalsMap.get(quoteToken)!;
    let baseDecimals = decimalsMap.get(baseToken)!;

    let quoteUiAmount = lamportsToAmountDecimal(quoteAmount, quoteDecimals);
    let baseUiAmount = lamportsToAmountDecimal(baseAmount, baseDecimals);

    if (baseUiAmount.lt(filterOutBaseDecimalAmount)) {
      continue;
    }

    if (quoteUiAmount.lt(filterOutQuoteDecimalAmount)) {
      continue;
    }

    let price = baseUiAmount.div(quoteUiAmount);
    let quoteDisplay = quoteToken.slice(0, 4);
    let baseDisplay = baseToken.slice(0, 4);

    askOrdersFormatted.push({
      price,
      quoteUiAmount,
      baseUiAmount,
      quoteDisplay,
      baseDisplay,
      orderAddress,
    });
  }

  for (let [order, orderAddress] of bidOrders) {
    // TODO: remove this, temporary until smart contracts fixed
    if (order.expectedOutputAmount === 0n) {
      continue;
    }
    let quoteAmount = new Decimal(order.expectedOutputAmount.toString());
    let baseAmount = new Decimal(order.initialInputAmount.toString());

    let quoteToken = order.outputMint.toString();
    let baseToken = order.inputMint.toString();

    let quoteDecimals = decimalsMap.get(quoteToken)!;
    let baseDecimals = decimalsMap.get(baseToken)!;

    let quoteUiAmount = lamportsToAmountDecimal(quoteAmount, quoteDecimals);
    let baseUiAmount = lamportsToAmountDecimal(baseAmount, baseDecimals);

    if (baseUiAmount.lt(filterOutBaseDecimalAmount)) {
      continue;
    }

    if (quoteUiAmount.lt(filterOutQuoteDecimalAmount)) {
      continue;
    }

    let price = baseUiAmount.div(quoteUiAmount);
    let quoteDisplay = quoteToken.slice(0, 4);
    let baseDisplay = baseToken.slice(0, 4);

    bidOrdersFormatted.push({
      price,
      quoteUiAmount,
      baseUiAmount,
      quoteDisplay,
      baseDisplay,
      orderAddress,
    });
  }

  bidOrdersFormatted.sort((a, b) => {
    return b.price.comparedTo(a.price);
  });

  askOrdersFormatted.sort((a, b) => {
    return b.price.comparedTo(a.price);
  });

  for (let order of askOrdersFormatted) {
    console.log(
      red("ASK"),
      "Price",
      order.price.toFixed(5).padEnd(15, " "),
      "| Sell",
      order.quoteUiAmount.toFixed(5).padStart(15, " "),
      order.quoteDisplay,
      "| For",
      order.baseUiAmount.toFixed(5).padStart(20, " "),
      order.baseDisplay,
      "| OrderId",
      order.orderAddress.toString(),
    );
  }

  for (let order of bidOrdersFormatted) {
    console.log(
      green("BID"),
      "Price",
      order.price.toFixed(5).padEnd(15, " "),
      "| Buy ",
      order.quoteUiAmount.toFixed(5).padStart(15, " "),
      order.quoteDisplay,
      "| For",
      order.baseUiAmount.toFixed(5).padStart(20, " "),
      order.baseDisplay,
      "| OrderId",
      order.orderAddress.toString(),
    );
  }
}

export async function getAllOrders() {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;

  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  const ordersAndAddresses =
    await client.getAllOrdersStateAndAddressForGlobalConfig();

  for (const order of ordersAndAddresses) {
    console.log(order.address);
  }
}

const PRICES_API_URL =
  "https://api.kamino.finance/prices?env=mainnet-beta&source=scope";

async function fetchUsdPrices(): Promise<Map<string, Decimal>> {
  const prices = new Map<string, Decimal>();
  try {
    const response = await fetch(PRICES_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as {
      mint: string;
      usdPrice: string;
    }[];
    for (const entry of data) {
      prices.set(entry.mint, new Decimal(entry.usdPrice));
    }
  } catch (error) {
    console.error(red("Failed to fetch USD prices, showing n/a:"), error);
  }
  return prices;
}

// Lists all active orders with remaining input, plus the USD value still unfilled.
export async function listOpenOrders(csvPath?: string) {
  const { admin, rpc, globalConfig } = requireReadEnv();

  const env = await initializeClient(rpc, admin, getLimoProgramId(), false);
  const client = new LimoClient(
    env.rpc,
    env.rpcWs,
    address(globalConfig),
    undefined,
    env.programAddress,
  );

  const ordersAndStates =
    await client.getAllOrdersStateAndAddressForGlobalConfig();
  // Skip zero-amount orders: they would divide by zero in toOrdersDisplay.
  const openOrders = ordersAndStates.filter(
    (o) =>
      o.state.status === OrderStatus.Active &&
      o.state.remainingInputAmount > 0n &&
      o.state.initialInputAmount > 0n &&
      o.state.expectedOutputAmount > 0n,
  );

  if (openOrders.length === 0) {
    console.log("No open orders");
    return;
  }

  const mints = new Set<Address>();
  for (const order of openOrders) {
    mints.add(order.state.inputMint);
    mints.add(order.state.outputMint);
  }
  const mintDecimals = await client.getMintDecimals([...mints]);
  const usdPrices = await fetchUsdPrices();

  const orders = client.toOrdersDisplay(openOrders, mintDecimals);

  const ordersWithUsd = orders.map((order) => {
    const inputUsdPrice = usdPrices.get(order.state.inputMint.toString());
    const unfilledUsd = inputUsdPrice
      ? order.remainingInputAmountDecimal.mul(inputUsdPrice)
      : undefined;
    return { order, inputUsdPrice, unfilledUsd };
  });

  // Largest unfilled USD value first, unknown prices last.
  ordersWithUsd.sort((a, b) => {
    if (!a.unfilledUsd && !b.unfilledUsd) return 0;
    if (!a.unfilledUsd) return 1;
    if (!b.unfilledUsd) return -1;
    return b.unfilledUsd.comparedTo(a.unfilledUsd);
  });

  console.log(
    green(
      "Price".padStart(15, " ") +
        " |" +
        "Buy".padStart(7, " ").padEnd(62, " ") +
        " |" +
        "Sell".padStart(8, " ").padEnd(62, " ") +
        " |" +
        "Filled %".padStart(11, " ") +
        " |" +
        "Unfilled $".padStart(15, " ") +
        " |" +
        "OrderId".padStart(15, " "),
    ),
  );

  let totalUnfilledUsd = new Decimal(0);
  for (const { order, unfilledUsd } of ordersWithUsd) {
    if (unfilledUsd) {
      totalUnfilledUsd = totalUnfilledUsd.add(unfilledUsd);
    }
    console.log(
      green("->"),
      order.orderPriceInputToOutput.toFixed(5).padStart(12, " "),
      "|",
      order.expectedOutputAmountDecimal.toFixed(5).padStart(10, " "),
      order.state.outputMint.toString().padEnd(50, " "),
      "|",
      order.initialInputAmountDecimal.toFixed(5).padStart(10, " "),
      order.state.inputMint.toString().padEnd(50, " "),
      "|",
      order.orderFillPct.mul(100).toFixed(2).padStart(10, " "),
      "|",
      (unfilledUsd ? unfilledUsd.toFixed(2) : "n/a").padStart(13, " "),
      "|",
      order.address.toString(),
    );
  }

  console.log(
    green(
      `Total: ${ordersWithUsd.length} open orders, $${totalUnfilledUsd.toFixed(2)} unfilled`,
    ),
  );

  if (csvPath) {
    const header =
      "order_address,maker,input_mint,output_mint,price_input_to_output," +
      "initial_input_amount,remaining_input_amount,expected_output_amount," +
      "filled_pct,input_usd_price,unfilled_usd";
    const rows = ordersWithUsd.map(({ order, inputUsdPrice, unfilledUsd }) =>
      [
        order.address.toString(),
        order.maker.toString(),
        order.state.inputMint.toString(),
        order.state.outputMint.toString(),
        order.orderPriceInputToOutput.toString(),
        order.initialInputAmountDecimal.toString(),
        order.remainingInputAmountDecimal.toString(),
        order.expectedOutputAmountDecimal.toString(),
        order.orderFillPct.mul(100).toFixed(2),
        inputUsdPrice ? inputUsdPrice.toString() : "",
        unfilledUsd ? unfilledUsd.toFixed(2) : "",
      ].join(","),
    );
    fs.writeFileSync(csvPath, [header, ...rows].join("\n") + "\n");
    console.log(green(`Wrote ${rows.length} orders to ${csvPath}`));
  }
}

async function getOrders(
  client: LimoClient,
  inTokenMint: Address | undefined,
  outTokenMint: Address | undefined,
): Promise<[Order, Address][]> {
  let filters: SolanaKitFilter[] = [];

  if (inTokenMint) {
    filters.push({
      memcmp: {
        bytes: inTokenMint.toString() as Base58EncodedBytes,
        encoding: "base58",
        offset: BigInt(8 + 32 + 32),
      },
    });
  }
  if (outTokenMint) {
    filters.push({
      memcmp: {
        bytes: outTokenMint.toString() as Base58EncodedBytes,
        encoding: "base58",
        offset: BigInt(8 + 32 + 32 + 32 + 32),
      },
    });
  }

  const ordersAndAddresses =
    await client.getAllOrdersStateAndAddressWithFilters(
      filters,
      undefined,
      true,
    );
  return ordersAndAddresses.map((orderData) => [
    orderData.state,
    orderData.address,
  ]);
}

export async function placeOrder(
  quoteToken: string | undefined,
  baseToken: string | undefined,
  uiAmount: number,
  price: number,
  type: "bid" | "ask",
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;

  let base = address((baseToken ?? process.env.BASE_TOKEN)!);
  let quote = address((quoteToken ?? process.env.QUOTE_TOKEN)!);

  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  const mintTokenPrograms = await client.getMintsProgramOwners([base, quote]);
  const baseTokenProgram = mintTokenPrograms[0];
  const quoteTokenProgram = mintTokenPrograms[1];

  let orderAddress: Address;
  let signature: string;

  if (type === "bid") {
    const [sig, order] = await client.placeBid(
      env.admin,
      quote,
      base,
      new Decimal(uiAmount), // baseUIAmount
      new Decimal(price),
      "execute",
      baseTokenProgram,
      quoteTokenProgram,
    );
    orderAddress = order.address;
    signature = sig;
  } else {
    const [sig, order] = await client.placeAsk(
      env.admin,
      quote,
      base,
      new Decimal(uiAmount), // quoteUIAmount
      new Decimal(price),
      "execute",
      quoteTokenProgram,
      baseTokenProgram,
    );
    orderAddress = order.address;
    signature = sig;
  }

  console.log("Place order", signature.toString());
  console.log("Order address:", orderAddress.toString());
}

// Fail fast on missing env vars with an actionable error.
// Read-only commands: ADMIN is optional since nothing is signed.
function requireReadEnv(): {
  admin: string | undefined;
  rpc: string;
  globalConfig: string;
} {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  if (!rpc) throw new Error("RPC_ENV env var must be set");
  if (!globalConfig) throw new Error("LIMO_GLOBAL_CONFIG env var must be set");
  return { admin, rpc, globalConfig };
}

// State-changing commands additionally need the ADMIN keypair to sign.
function requireBaseEnv(): {
  admin: string;
  rpc: string;
  globalConfig: string;
} {
  const { admin, rpc, globalConfig } = requireReadEnv();
  if (!admin) throw new Error("ADMIN env var must be set (admin keypair path)");
  return { admin, rpc, globalConfig };
}

// Close a single order owned by the ADMIN keypair and reclaim its locked tokens + tip.
export async function closeOrder(orderAddress: Address, mode: string) {
  const { admin, rpc, globalConfig } = requireBaseEnv();

  const env = await initializeClient(rpc, admin, getLimoProgramId(), false);
  const client = new LimoClient(
    env.rpc,
    env.rpcWs,
    address(globalConfig),
    undefined,
    env.programAddress,
  );

  const state = await fetchMaybeOrder(env.rpc, orderAddress);
  if (!state.exists) {
    console.log(red("Order not found"));
    return;
  }

  const sig = await client.closeOrderAndClaimTip(
    env.admin,
    { state: state.data, address: orderAddress },
    mode,
  );
  console.log(green("Closed"), orderAddress.toString(), sig.toString());
}

// Close every order owned by the ADMIN keypair (the maker/signer).
export async function closeAllOrders(mode: string) {
  const { admin, rpc, globalConfig } = requireBaseEnv();

  const env = await initializeClient(rpc, admin, getLimoProgramId(), false);
  const client = new LimoClient(
    env.rpc,
    env.rpcWs,
    address(globalConfig),
    undefined,
    env.programAddress,
  );

  const orders = await client.getAllOrdersStateAndAddressForMaker(
    env.admin.address,
  );
  if (orders.length === 0) {
    console.log("No orders to close for", env.admin.address.toString());
    return;
  }

  console.log(`Closing ${orders.length} orders for ${env.admin.address}`);
  for (const order of orders) {
    const sig = await client.closeOrderAndClaimTip(env.admin, order, mode);
    console.log(green("Closed"), order.address.toString(), sig.toString());
  }
}

export async function permissionlessTakeOrder(
  order: Address,
  amountToTakeDecimals: number | undefined,
  tipAmountLamports: number | undefined,
  mode: string,
) {
  const { admin, rpc, globalConfig } = requireBaseEnv();
  const expressRelayProgramIdRaw = process.env.EXPRESS_RELAY_PROGRAM_ID;
  if (!expressRelayProgramIdRaw) {
    throw new Error("EXPRESS_RELAY_PROGRAM_ID env var must be set");
  }
  const expressRelayProgramId = address(expressRelayProgramIdRaw);

  const env = await initializeClient(rpc, admin, getLimoProgramId(), false);
  const client = new LimoClient(
    env.rpc,
    env.rpcWs,
    address(globalConfig),
    undefined,
    env.programAddress,
  );

  const orderAccount = await fetchMaybeOrder(env.rpc, order);

  if (!orderAccount.exists) {
    console.log("Order not found");
    return;
  }
  const orderState = orderAccount.data;

  const mintDecimals = await client.getMintDecimals([
    orderState.inputMint,
    orderState.outputMint,
  ]);

  const inputAmountToTakeLamports = amountToTakeDecimals
    ? amountToLamportsBN(
        new Decimal(amountToTakeDecimals),
        mintDecimals.get(orderState.inputMint)!,
      )
    : new BN(orderState.initialInputAmount.toString());

  const expectedOutputAmountDecimal = new BN(
    orderState.expectedOutputAmount.toString(),
  )
    .mul(inputAmountToTakeLamports)
    .div(new BN(orderState.initialInputAmount.toString()));

  await client.permissionlessTakeOrder(
    env.admin,
    {
      state: orderState,
      address: order,
    },
    inputAmountToTakeLamports,
    expectedOutputAmountDecimal,
    expressRelayProgramId,
    mode,
    tipAmountLamports ? new BN(tipAmountLamports) : new BN(0),
    mintDecimals,
  );
}

export async function listOrdersForUser(user: Address) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;

  const env = await initializeClient(rpc!, admin, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  // Time and print the duration of the line below
  let orders = await client.getAllOrdersDisplayForMaker(user);

  console.log(
    green(
      "Price".padStart(15, " ") +
        " |" +
        "Buy".padStart(7, " ").padEnd(62, " ") +
        " |" +
        "Sell".padStart(8, " ").padEnd(62, " ") +
        " |" +
        "Filled %".padStart(11, " ") +
        " |" +
        "OrderId".padStart(15, " "),
    ),
  );

  for (let order of orders) {
    console.log(
      green("->"),
      order.orderPriceInputToOutput.toFixed(5).padStart(12, " "),
      "|",
      order.expectedOutputAmountDecimal.toFixed(5).padStart(10, " "),
      order.state.outputMint.toString().padEnd(50, " "),
      "|",
      order.initialInputAmountDecimal.toFixed(5).padStart(10, " "),
      order.state.inputMint.toString().padEnd(50, " "),
      "|",
      order.orderFillPct.mul(100).toFixed(2).padStart(10, " "),
      "|",
      order.address.toString(),
    );
  }
}
