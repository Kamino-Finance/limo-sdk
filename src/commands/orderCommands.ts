import { Order } from "../rpc_client/accounts";
import { green, initializeClient, red } from "./utils";
import {
  amountToLamportsBN,
  getLimoProgramId,
  getMintDecimals,
  lamportsToAmountDecimal,
  SolanaKitFilter,
} from "../utils";
import { LimoClient } from "../Limo";
import Decimal from "decimal.js";
import BN from "bn.js";
import { Address, address } from "@solana/kit";
import { Base58EncodedBytes } from "@solana/kit/dist/types";

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
    if (order.initialInputAmount.toNumber() === 0) {
      continue;
    }

    let quoteAmount = new Decimal(order.initialInputAmount.toNumber());
    let baseAmount = new Decimal(order.expectedOutputAmount.toNumber());

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
    if (order.expectedOutputAmount.toNumber() === 0) {
      continue;
    }
    let quoteAmount = new Decimal(order.expectedOutputAmount.toNumber());
    let baseAmount = new Decimal(order.initialInputAmount.toNumber());

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

  let orderState: Order | null = await Order.fetch(
    env.rpc,
    orderAddress,
    client.getProgramID(),
  );

  console.log("Place order", signature.toString());
}

export async function permissionlessTakeOrder(
  order: Address,
  amountToTakeDecimals: number | undefined,
  tipAmountLamports: number | undefined,
  mode: string,
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  const expressRelayProgramId = address(process.env.EXPRESS_RELAY_PROGRAM_ID!);

  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  const orderState = await Order.fetch(env.rpc, order, client.getProgramID());

  if (!orderState) {
    console.log("Order not found");
    return;
  }

  const mintDecimals = await client.getMintDecimals([
    orderState.inputMint,
    orderState.outputMint,
  ]);

  const inputAmountToTakeLamports = amountToTakeDecimals
    ? amountToLamportsBN(
        new Decimal(amountToTakeDecimals),
        mintDecimals.get(orderState.inputMint)!,
      )
    : orderState.initialInputAmount;

  const expectedOutputAmountDecimal = orderState.expectedOutputAmount
    .mul(inputAmountToTakeLamports)
    .div(orderState.initialInputAmount);

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
