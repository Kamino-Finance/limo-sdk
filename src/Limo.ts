import BN from "bn.js";

import {
  amountToLamportsBN,
  asOption,
  AssertUserSwapBalancesIxArgs,
  checkIfAccountExists,
  createAddExtraComputeUnitFeeTransaction,
  createAtaIdempotent,
  createKeypairRentExemptIxSync,
  CreateOrderWithParamsArgs,
  DEFAULT_ADDRESS,
  divCeil,
  FilledOrder,
  FlashTakeOrderIxs,
  getEventAuthorityPDA,
  getIntermediaryTokenAccountPDA,
  getMintDecimals,
  getPdaAuthority,
  getTokenVaultPDA,
  getUserSwapBalanceAssertStatePDA,
  getUserSwapBalanceStatePDA,
  lamportsToAmountBN,
  lamportsToAmountDecimal,
  LogUserSwapBalancesIxArgs,
  OrderDisplay,
  OrderListenerCallbackOnChange,
  OrderStateAndAddress,
  printMultisigTx,
  printSimulateTx,
  SolanaKitFilter,
  withdrawHostTipIx,
} from "./utils";

import * as limoOperations from "./utils/operations";
import { GlobalConfig, Order } from "./rpc_client/accounts";
import Decimal from "decimal.js";
import { UpdateGlobalConfigMode, UpdateOrderMode } from "./rpc_client/types";
import base58 from "bs58";
import {
  assertUserSwapBalancesEnd,
  assertUserSwapBalancesStart,
  logUserSwapBalancesEnd,
  logUserSwapBalancesStart,
} from "./rpc_client/instructions";
import {
  AccountRole,
  Address,
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getAddressEncoder,
  getSignatureFromTransaction,
  Instruction,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionSigner,
} from "@solana/kit";
import { Base58EncodedBytes } from "@solana/kit/dist/types";
import {
  AccountInfoBase,
  AccountInfoWithBase64EncodedData,
  AccountInfoWithPubkey,
} from "@solana/rpc-types/dist/types/account-info";
import type { Slot } from "@solana/rpc-types/dist/types/typed-numbers";
import {
  addSignersToTransactionMessage,
  generateKeyPairSigner,
} from "@solana/signers";
import {
  findAssociatedTokenPda,
  getCloseAccountInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { AccountMeta } from "@solana/instructions/dist/types/accounts";
import {
  getTransferSolInstruction,
  SYSTEM_PROGRAM_ADDRESS,
} from "@solana-program/system";
import {
  SYSVAR_INSTRUCTIONS_ADDRESS,
  SYSVAR_RENT_ADDRESS,
} from "@solana/sysvars";

export const limoId = address("LiMoM9rMhrdYrfzUCxQppvxCSG1FcrUK9G8uLq4A1GF");

export const WRAPPED_SOL_MINT = address(
  "So11111111111111111111111111111111111111112",
);

export const ORDER_RENT_EXEMPTION_LAMPORTS = BigInt(3841920);
export const MAX_CLOSE_ORDER_AND_CLAIM_TIP_ORDERS_IN_TX = 14;

export class LimoClient {
  private readonly _connection: Rpc<SolanaRpcApi>;
  private readonly _subscription: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  public readonly programAddress: Address;
  private globalConfigState: GlobalConfig | undefined;
  private _globalConfig: Address;

  constructor(
    connection: Rpc<SolanaRpcApi>,
    subscription: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    globalConfig: Address | undefined,
    globalConfigState?: GlobalConfig,
  ) {
    this._connection = connection;
    this._subscription = subscription;
    this._globalConfig = globalConfig ?? DEFAULT_ADDRESS;
    this.programAddress = limoId;

    this.globalConfigState = globalConfigState;
  }

  getConnection() {
    return this._connection;
  }

  getSubscription() {
    return this._subscription;
  }

  getProgramID() {
    return this.programAddress;
  }

  /**
   * Sets the global config address
   * @param globalConfig - the global config address
   */
  setGlobalConfig(globalConfig: Address) {
    this._globalConfig = globalConfig;
  }

  /**
   * Refresh and get the global config state
   * @returns the global config state
   * @throws error if global config not set
   */
  async refreshGlobalConfigState() {
    if (!this._globalConfig) {
      throw new Error("Global Config not set");
    }
    const globalConfigState = await GlobalConfig.fetch(
      this._connection,
      this._globalConfig,
    );
    if (!globalConfigState) {
      throw new Error("Global Config not found");
    }
    this.globalConfigState = globalConfigState;
    return this.globalConfigState;
  }

  /**
   * Get the global config state
   * @returns the global config state
   * @throws error if global config not set
   */
  async getGlobalConfigState() {
    if (!this._globalConfig) {
      throw new Error("Global Config not set");
    }
    if (!this.globalConfigState) {
      const globalConfigState = await GlobalConfig.fetch(
        this._connection,
        this._globalConfig,
      );
      if (!globalConfigState) {
        throw new Error("Global Config not found");
      }
      this.globalConfigState = globalConfigState;
    }
    return this.globalConfigState;
  }

  /**
   * Get the global config state synchronously
   * @returns the global config state
   * @throws error if global config not set
   * @throws error if global config state not fetched yet
   */
  getGlobalConfigStateSync() {
    if (!this._globalConfig) {
      throw new Error("Global Config not set");
    }
    if (!this.globalConfigState) {
      throw new Error(
        "Global Config state not fetched yet, use getGlobalConfigState",
      );
    }
    return this.globalConfigState;
  }

  /**
   * Get the given order state
   * @param orderAddress - the order address
   * @returns the order state
   */
  async getOrderState(orderAddress: Address): Promise<Order> {
    const order = await Order.fetch(
      this._connection,
      orderAddress,
      this.programAddress,
    );

    if (!order) {
      throw new Error("Order not found");
    }

    return order;
  }

  /**
   * Gets all orders with given filters
   * @param filters - list of filters to apply to the get program accounts
   * @param globalConfigOverride - global config override to filter by
   * @param filterByGlobalConfig - whether to filter by global config or not
   * @returns list of order states and addresses
   */
  async getAllOrdersStateAndAddressWithFilters(
    filters: SolanaKitFilter[],
    globalConfigOverride?: Address,
    filterByGlobalConfig: boolean = true,
  ): Promise<OrderStateAndAddress[]> {
    if (filterByGlobalConfig) {
      filters.push({
        memcmp: {
          bytes: (globalConfigOverride
            ? globalConfigOverride.toString()
            : this._globalConfig.toString()) as Base58EncodedBytes,
          encoding: "base58" as const,
          offset: BigInt(8),
        },
      });
    }
    filters.push({
      dataSize: BigInt(Order.layout.span + 8),
    });
    const orderProgramAccounts = await this._connection
      .getProgramAccounts(this.programAddress, {
        filters,
        encoding: "base64",
      })
      .send();

    return orderProgramAccounts.map((orderProgramAccount) => {
      if (orderProgramAccount.account === null) {
        throw new Error("Invalid account");
      }
      if (orderProgramAccount.account.owner !== this.programAddress) {
        throw new Error("account doesn't belong to this program");
      }

      const buffer = Buffer.from(orderProgramAccount.account.data[0], "base64");
      const order = Order.decode(buffer);

      if (!order) {
        throw Error("Could not parse obligation.");
      }

      return {
        state: order,
        address: orderProgramAccount.pubkey,
      };
    });
  }

  /**
   * Gets all orders for global config
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order states and addresses
   * @throws error if global config not set
   */
  async getAllOrdersStateAndAddressForGlobalConfig(
    globalConfigOverride?: Address,
  ): Promise<OrderStateAndAddress[]> {
    return this.getAllOrdersStateAndAddressWithFilters(
      [],
      globalConfigOverride,
    );
  }

  /**
   * Gets all orders for global config and returns them as OrderDisplay
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order displays
   * @throws error if global config not set
   * @throws error if mint decimals not found for mint
   */
  async getAllOrdersDisplayForGlobalConfig(
    mintDecimals: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<OrderDisplay[]> {
    const ordersAndStates = await this.getAllOrdersStateAndAddressWithFilters(
      [],
      globalConfigOverride,
    );

    return this.toOrdersDisplay(ordersAndStates, mintDecimals);
  }

  /**
   * Gets all orders for a specific maker
   * @param maker - maker address
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order states and addresses
   * @throws error if global config not set
   * @throws error if mint decimals not found for mint
   */
  async getAllOrdersStateAndAddressForMaker(
    maker: Address,
    globalConfigOverride?: Address,
  ): Promise<OrderStateAndAddress[]> {
    const filters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: maker.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(40),
        },
      },
    ];

    return this.getAllOrdersStateAndAddressWithFilters(
      filters,
      globalConfigOverride,
    );
  }

  /**
   * Gets all orders for a specific maker and returns them as OrderDisplay
   * @param maker - maker address
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order displays
   * @throws error if global config not set
   * @throws error if mint decimals not found for mint
   */
  async getAllOrdersDisplayForMaker(
    maker: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<OrderDisplay[]> {
    const ordersAndStates = await this.getAllOrdersStateAndAddressForMaker(
      maker,
      globalConfigOverride,
    );

    const mints: Address[] = [];
    for (const order of ordersAndStates) {
      mints.push(order.state.inputMint);
      mints.push(order.state.outputMint);
    }

    let ordersMintDecimals =
      mintDecimals ?? (await this.getMintDecimals(mints));

    return this.toOrdersDisplay(ordersAndStates, ordersMintDecimals);
  }

  /**
   * Gets all orders for a specific input mint
   * @param inputMint - input mint address
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order states and addresses
   * @throws error if global config not set
   */
  async getAllOrdersStateAndAddressForInputMint(
    inputMint: Address,
    globalConfigOverride?: Address,
  ): Promise<OrderStateAndAddress[]> {
    const filters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: inputMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(72),
        },
      },
    ];

    return this.getAllOrdersStateAndAddressWithFilters(
      filters,
      globalConfigOverride,
    );
  }

  /**
   * Gets all orders for a specific input mint and returns them as OrderDisplay
   * @param inputMint - input mint address
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order displays
   * @throws error if global config not set
   */
  async getAllOrdersDisplayForInputMint(
    inputMint: Address,
    mintDecimals: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<OrderDisplay[]> {
    const ordersAndStates = await this.getAllOrdersStateAndAddressForInputMint(
      inputMint,
      globalConfigOverride,
    );

    return this.toOrdersDisplay(ordersAndStates, mintDecimals);
  }

  /**
   * Gets all orders for a specific output mint
   * @param outputMint - output mint address
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order states and addresses
   * @throws error if global config not set
   */
  async getAllOrdersStateAndAddressForOutputMint(
    outputMint: Address,
    globalConfigOverride?: Address,
  ): Promise<OrderStateAndAddress[]> {
    const filters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: outputMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    return this.getAllOrdersStateAndAddressWithFilters(
      filters,
      globalConfigOverride,
    );
  }

  /**
   * Gets all orders for a specific output mint and returns them as OrderDisplay
   * @param outputMint - output mint address
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order displays
   * @throws error if global config not set
   */
  async getAllOrdersDisplayForOutputMint(
    outputMint: Address,
    mintDecimals: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<OrderDisplay[]> {
    const ordersAndStates = await this.getAllOrdersStateAndAddressForOutputMint(
      outputMint,
      globalConfigOverride,
    );

    return this.toOrdersDisplay(ordersAndStates, mintDecimals);
  }

  /**
   * Gets all orders for a specific input and output mint
   * @param inputMint - input mint address
   * @param outputMint - output mint address
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order states and addresses
   * @throws error if global config not set
   */
  async getAllOrdersDisplayForInputAndOutputMints(
    inputMint: Address,
    outputMint: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<OrderDisplay[]> {
    const filters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: inputMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(72),
        },
      },
      {
        memcmp: {
          bytes: outputMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    const ordersStateAndAddresses =
      await this.getAllOrdersStateAndAddressWithFilters(
        filters,
        globalConfigOverride,
      );

    let mintDecimalsMap = new Map<Address, number>();

    if (!mintDecimals) {
      const inputMintDecimals = await getMintDecimals(
        this._connection,
        inputMint,
      );
      const outputMintDecimals = await getMintDecimals(
        this._connection,
        outputMint,
      );

      mintDecimalsMap.set(inputMint, inputMintDecimals);
      mintDecimalsMap.set(outputMint, outputMintDecimals);
    } else {
      mintDecimalsMap = mintDecimals;
    }

    return this.toOrdersDisplay(ordersStateAndAddresses, mintDecimalsMap);
  }

  /**
   * Gets all orders for a specific maker, input and output mint
   * @param maker - maker address
   * @param inputMint - input mint address
   * @param outputMint - output mint address
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns list of order displays
   * @throws error if global config not set
   * @throws error if mint decimals not found for mint
   */
  async getAllOrdersDisplayForMakerInputAndOutputMints(
    maker: Address,
    inputMint: Address,
    outputMint: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<OrderDisplay[]> {
    // Global config filter is always happening in getAllOrdersStateAndAddressWithFilters
    // but max of 4 filters are allowed so we merge maker and inputMint as they are
    // consecutive pubkeys in the order account maker at byte 40 and input mint at byte 72
    const addressEncoder = getAddressEncoder();

    const mergedMakerInputMint = Buffer.concat([
      new Uint8Array(Buffer.from(addressEncoder.encode(maker))),
      new Uint8Array(Buffer.from(addressEncoder.encode(inputMint))),
    ]);

    const filters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: base58.encode(mergedMakerInputMint) as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(40),
        },
      },
      {
        memcmp: {
          bytes: outputMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    const ordersStateAndAddresses =
      await this.getAllOrdersStateAndAddressWithFilters(
        filters,
        globalConfigOverride,
      );

    let mintDecimalsMap = new Map<Address, number>();

    if (mintDecimals) {
      const inputMintDecimals = await getMintDecimals(
        this._connection,
        inputMint,
      );
      const outputMintDecimals = await getMintDecimals(
        this._connection,
        outputMint,
      );

      mintDecimalsMap.set(inputMint, inputMintDecimals);
      mintDecimalsMap.set(outputMint, outputMintDecimals);
    }

    return this.toOrdersDisplay(ordersStateAndAddresses, mintDecimalsMap);
  }

  async getOrderDisplay(orderAddress: Address): Promise<OrderDisplay> {
    const order = await Order.fetch(
      this._connection,
      orderAddress,
      this.programAddress,
    );

    if (!order) {
      throw new Error("Order not found");
    }

    const inputMintDecimals = await getMintDecimals(
      this._connection,
      order.inputMint,
    );
    const outputMintDecimals = await getMintDecimals(
      this._connection,
      order.outputMint,
    );

    const mintDecimalsMap = new Map<Address, number>();

    mintDecimalsMap.set(order.inputMint, inputMintDecimals);
    mintDecimalsMap.set(order.outputMint, outputMintDecimals);

    return this.toOrdersDisplay(
      [{ address: orderAddress, state: order }],
      mintDecimalsMap,
    )[0];
  }

  /**
   * Converts order states and addresses to order displays
   * @param orders - list of order states and addresses
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @returns list of order displays
   * @throws error if mint decimals not found for mint
   */
  toOrdersDisplay(
    orders: OrderStateAndAddress[],
    mintDecimals: Map<Address, number>,
  ): OrderDisplay[] {
    const ordersDisplay: OrderDisplay[] = [];
    for (const order of orders) {
      const inputMintDecimals = mintDecimals.get(order.state.inputMint);
      if (!inputMintDecimals) {
        throw new Error(
          "Mint decimals not found for mint + " +
            order.state.inputMint.toString(),
        );
      }
      const outputMintDecimals = mintDecimals.get(order.state.outputMint);
      if (!outputMintDecimals) {
        throw new Error(
          "Mint decimals not found for mint + " +
            order.state.outputMint.toString(),
        );
      }
      const initialInputAmountDecimal = new Decimal(
        order.state.initialInputAmount.toString(),
      ).div(new Decimal(10).pow(inputMintDecimals));

      const expectedOutputAmountDecimal = new Decimal(
        order.state.expectedOutputAmount.toString(),
      ).div(new Decimal(10).pow(outputMintDecimals));

      const remainingInputAmountDecimal = new Decimal(
        order.state.remainingInputAmount.toString(),
      ).div(new Decimal(10).pow(inputMintDecimals));

      const filledOutputAmountDecimal = new Decimal(
        order.state.filledOutputAmount.toString(),
      ).div(new Decimal(10).pow(outputMintDecimals));

      const orderFillPct = initialInputAmountDecimal
        .sub(remainingInputAmountDecimal)
        .div(initialInputAmountDecimal);

      const orderTipLamports = new Decimal(order.state.tipAmount.toString());
      const orderTipDecimal = lamportsToAmountDecimal(orderTipLamports, 9); // tip is native sol which

      ordersDisplay.push({
        address: order.address,
        state: order.state,
        maker: order.state.maker,
        initialInputAmountDecimal,
        expectedOutputAmountDecimal,
        remainingInputAmountDecimal,
        filledOutputAmountDecimal,
        numberOfFills: order.state.numberOfFills.toNumber(),
        orderFillPct: orderFillPct,
        orderPriceInputToOutput: initialInputAmountDecimal.div(
          expectedOutputAmountDecimal,
        ),
        orderPriceOutputToInput: expectedOutputAmountDecimal.div(
          initialInputAmountDecimal,
        ),
        executionPriceInputToOutput: initialInputAmountDecimal
          .sub(remainingInputAmountDecimal)
          .div(filledOutputAmountDecimal),
        executionPriceOutputToInput: filledOutputAmountDecimal.div(
          initialInputAmountDecimal.sub(remainingInputAmountDecimal),
        ),
        orderTipLamports,
        orderTipDecimal,
      });
    }

    return ordersDisplay;
  }

  /**
   * Returns the ask and bid OrderDisplay arrays for a given base and quote token mint
   * @param baseTokenMint - the base token mint
   * @param quoteTokenMint - the quote token mint
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns { askOrders: OrderDisplay[], bidOrders: OrderDisplay[] } - the ask and bid orders
   * @throws error if mint decimals not found for mint
   * @throws error if global config not set
   */
  async getOrdersDisplayForBaseAndQuote(
    baseTokenMint: Address,
    quoteTokenMint: Address,
    mintDecimals: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<{ askOrders: OrderDisplay[]; bidOrders: OrderDisplay[] }> {
    const bidOrders = await this.getAllOrdersDisplayForInputAndOutputMints(
      baseTokenMint,
      quoteTokenMint,
      mintDecimals,
      globalConfigOverride,
    );
    const askOrders = await this.getAllOrdersDisplayForInputAndOutputMints(
      quoteTokenMint,
      baseTokenMint,
      mintDecimals,
      globalConfigOverride,
    );

    return {
      bidOrders,
      askOrders,
    };
  }

  /**
   * Returns the ask and bid OrderDisplay arrays for a given base and quote token mint and maker
   * @param maker - the maker address
   * @param baseTokenMint - the base token mint
   * @param quoteTokenMint - the quote token mint
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns { askOrders: OrderDisplay[], bidOrders: OrderDisplay[] } - the ask and bid orders
   * @throws error if mint decimals not found for mint
   * @throws error if global config not set
   */
  async getOrdersDisplayForBaseAndQuoteAndMaker(
    maker: Address,
    baseTokenMint: Address,
    quoteTokenMint: Address,
    mintDecimals: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<{ askOrders: OrderDisplay[]; bidOrders: OrderDisplay[] }> {
    const bidOrders = await this.getAllOrdersDisplayForMakerInputAndOutputMints(
      maker,
      baseTokenMint,
      quoteTokenMint,
      mintDecimals,
      globalConfigOverride,
    );
    const askOrders = await this.getAllOrdersDisplayForMakerInputAndOutputMints(
      maker,
      quoteTokenMint,
      baseTokenMint,
      mintDecimals,
      globalConfigOverride,
    );

    return {
      bidOrders,
      askOrders,
    };
  }

  /**
   * Returns the sell and buy FilledOrder arrays for a given base and quote token
   * @param baseTokenMint - the base token mint
   * @param quoteTokenMint - the quote token mint
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param globalConfigOverride - global config override to filter by
   * @returns { filledOrdersSell: FilledOrder[], filledOrdersBuy: FilledOrder[] } - the sell and buy filled orders
   * @throws error if mint decimals not found for mint
   * @throws error if global config not set
   */
  async getLatestFilledOrders(
    baseTokenMint: Address,
    quoteTokenMint: Address,
    mintDecimals: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<{
    filledOrdersBuy: FilledOrder[];
    filledOrdersSell: FilledOrder[];
  }> {
    const { askOrders, bidOrders } = await this.getOrdersDisplayForBaseAndQuote(
      baseTokenMint,
      quoteTokenMint,
      mintDecimals,
      globalConfigOverride,
    );
    const filledOrdersSell: FilledOrder[] = [];
    const filledOrdersBuy: FilledOrder[] = [];

    for (const order of askOrders) {
      if (
        order.state.remainingInputAmount.toNumber() <
        order.state.initialInputAmount.toNumber()
      ) {
        filledOrdersSell.push({
          address: order.address,
          orderDisplay: order,
          quoteTokenMint: quoteTokenMint,
          baseTokenMint: baseTokenMint,
          time: order.state.lastUpdatedTimestamp.toNumber(),
          price: order.executionPriceOutputToInput,
          size: order.filledOutputAmountDecimal,
          txid: "N/A",
          type: "sell",
        });
      }
    }

    for (const order of bidOrders) {
      if (
        order.state.remainingInputAmount.toNumber() <
        order.state.initialInputAmount.toNumber()
      ) {
        filledOrdersBuy.push({
          address: order.address,
          orderDisplay: order,
          quoteTokenMint: quoteTokenMint,
          baseTokenMint: baseTokenMint,
          time: order.state.lastUpdatedTimestamp.toNumber(),
          price: order.executionPriceInputToOutput,
          size: order.filledOutputAmountDecimal,
          txid: "N/A",
          type: "buy",
        });
      }
    }

    // sort by filledTimestamp
    filledOrdersBuy.sort((a, b) => -(a.time - b.time));
    filledOrdersSell.sort((a, b) => -(a.time - b.time));

    return { filledOrdersBuy, filledOrdersSell };
  }

  /**
   * Starts listening to order changes for a specific maker
   * @param maker - the maker address
   * @param callbackOnChange - callback to be called when an order changes
   * @returns subscriptionId - a number of the subscription id, to be used to stop the listener
   */
  async listenToMakerOrders(
    maker: Address,
    callbackOnChange: OrderListenerCallbackOnChange,
  ): Promise<AbortController> {
    const filters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: maker.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(40),
        },
      },
    ];

    const abortController = await this.listenToOrdersChangeWithFilters(
      filters,
      callbackOnChange,
    );

    return abortController;
  }

  /**
   * Starts listening to order changes with 2 separate listeners, one for sell orders and one for buy orders
   * @param baseTokenMint - the base token mint
   * @param quoteTokenMint - the quote token mint
   * @param callbackOnChangeSellOrders - callback to be called when a sell order changes
   * @param callbackOnChangeBuyOrders - callback to be called when a buy order changes
   * @returns { subscriptionIdSellOrders, subscriptionIdBuyOrders } - the subscription id for the two listeners (both should be closed when subscription no longer needed)
   */
  async listenToOrderChangeForBaseAndQuote(
    baseTokenMint: Address,
    quoteTokenMint: Address,
    callbackOnChangeSellOrders: OrderListenerCallbackOnChange,
    callbackOnChangeBuyOrders: OrderListenerCallbackOnChange,
  ): Promise<{
    abortControllerSellOrders: AbortController;
    abortControllerBuyOrders: AbortController;
  }> {
    const buyFilters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: baseTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(72),
        },
      },
      {
        memcmp: {
          bytes: quoteTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    const sellFilters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: quoteTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(72),
        },
      },
      {
        memcmp: {
          bytes: baseTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    const abortControllerSellOrders =
      await this.listenToOrdersChangeWithFilters(
        sellFilters,
        callbackOnChangeSellOrders,
      );
    const abortControllerBuyOrders = await this.listenToOrdersChangeWithFilters(
      buyFilters,
      callbackOnChangeBuyOrders,
    );

    return { abortControllerSellOrders, abortControllerBuyOrders };
  }

  /**
   * Starts listening to order changes with 2 separate listeners, one for sell orders and one for buy orders - filter for only filled orders
   * @param baseTokenMint - the base token mint
   * @param quoteTokenMint - the quote token mint
   * @param callbackOnChangeSellOrders - callback to be called when a sell order changes
   * @param callbackOnChangeBuyOrders - callback to be called when a buy order changes
   * @returns { subscriptionIdSellOrders, subscriptionIdBuyOrders } - the subscription id for the two listeners (both should be closed when subscription no longer needed)
   */
  async listenToOrderFillChangeForBaseAndQuote(
    baseTokenMint: Address,
    quoteTokenMint: Address,
    callbackOnChangeSellOrders: OrderListenerCallbackOnChange,
    callbackOnChangeBuyOrders: OrderListenerCallbackOnChange,
  ): Promise<{
    abortControllerSellOrders: AbortController;
    abortControllerBuyOrders: AbortController;
  }> {
    const buyFilters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: baseTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(72),
        },
      },
      {
        memcmp: {
          bytes: quoteTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    const sellFilters: SolanaKitFilter[] = [
      {
        memcmp: {
          bytes: quoteTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(72),
        },
      },
      {
        memcmp: {
          bytes: baseTokenMint.toString() as Base58EncodedBytes,
          encoding: "base58",
          offset: BigInt(136),
        },
      },
    ];

    const callbackOnChangeSellOrdersFilledOrdersOnly = (
      orderStateAndAddress: OrderStateAndAddress,
      slot: Slot,
    ) => {
      if (
        orderStateAndAddress.state.remainingInputAmount.toNumber() <
        orderStateAndAddress.state.initialInputAmount.toNumber()
      ) {
        callbackOnChangeSellOrders(orderStateAndAddress, slot);
      }
    };

    const callbackOnChangeBuyOrdersFilledOrdersOnly = (
      orderStateAndAddress: OrderStateAndAddress,
      slot: Slot,
    ) => {
      if (
        orderStateAndAddress.state.remainingInputAmount.toNumber() <
        orderStateAndAddress.state.initialInputAmount.toNumber()
      ) {
        callbackOnChangeBuyOrders(orderStateAndAddress, slot);
      }
    };

    const abortControllerSellOrders =
      await this.listenToOrdersChangeWithFilters(
        sellFilters,
        callbackOnChangeSellOrdersFilledOrdersOnly,
      );
    const abortControllerBuyOrders = await this.listenToOrdersChangeWithFilters(
      buyFilters,
      callbackOnChangeBuyOrdersFilledOrdersOnly,
    );

    return { abortControllerSellOrders, abortControllerBuyOrders };
  }

  /**
   * Starts listening to order changes based on the filters provided, for the global config
   * @param filters - list of filters to apply to the get program accounts
   * @param callbackOnChange - callback to be called when an order changes
   * @returns subscriptionId - a number of the subscription id, to be used to stop the listener
   */
  async listenToOrdersChangeWithFilters(
    filters: SolanaKitFilter[],
    callbackOnChange: OrderListenerCallbackOnChange,
  ): Promise<AbortController> {
    filters.push({
      memcmp: {
        bytes: this._globalConfig.toString() as Base58EncodedBytes,
        encoding: "base58",
        offset: BigInt(8),
      },
    });
    filters.push({
      dataSize: BigInt(Order.layout.span + 8),
    });

    const callbackOnChangeWtihDecoding = async (
      keyedAccountInfo: AccountInfoWithPubkey<
        AccountInfoBase & AccountInfoWithBase64EncodedData
      >,
      context: {
        slot: Slot;
      },
    ) => {
      if (keyedAccountInfo.account === null) {
        throw new Error("Invalid account");
      }
      if (keyedAccountInfo.account.owner !== this.programAddress) {
        throw new Error("account doesn't belong to this program");
      }

      const [base64Data, encoding] = keyedAccountInfo.account.data;
      const order = Order.decode(Buffer.from(base64Data, encoding));

      if (!order) {
        throw Error("Could not parse obligation.");
      }

      callbackOnChange(
        {
          state: order,
          address: keyedAccountInfo.pubkey,
        },
        context.slot,
      );
    };
    const abortController = new AbortController();

    const subscriptionId = await this._subscription
      .programNotifications(this.programAddress, {
        commitment: "confirmed",
        encoding: "base64",
        filters,
      })
      .subscribe({ abortSignal: abortController.signal });

    (async () => {
      for await (const notification of subscriptionId) {
        callbackOnChangeWtihDecoding(notification.value, notification.context);
      }
    })();

    return abortController;
  }

  /**
   * Stops listening to order changes based on the abort controller
   * @param abortController
   */
  stopListeningToOrdersChange(abortController: AbortController) {
    abortController.abort();
  }

  /**
   * Get the create global config instruction
   * @param admin - the admin address
   * @param globalConfig - the global config keypair
   * @returns the create global config instruction
   */
  async createGlobalConfigIxs(
    admin: TransactionSigner,
    globalConfig: TransactionSigner,
  ): Promise<Instruction[]> {
    let ixs: Instruction[] = [];

    const globalConfigSize = GlobalConfig.layout.span + 8;

    const lamports = await this._connection
      .getMinimumBalanceForRentExemption(BigInt(globalConfigSize))
      .send();

    ixs.push(
      createKeypairRentExemptIxSync(
        admin,
        globalConfig,
        globalConfigSize,
        lamports.valueOf(),
        this.programAddress,
      ),
    );

    const pdaAuthority = await getPdaAuthority(
      this.programAddress,
      globalConfig.address,
    );

    ixs.push(
      limoOperations.initializeGlobalConfig(
        admin,
        globalConfig.address,
        pdaAuthority,
        this.programAddress,
      ),
    );

    return ixs;
  }

  /**
   * Create the global config
   * @param admin - the admin keypair
   * @param globalConfig - the global config keypair
   * @returns the transaction signature
   */
  async createGlobalConfig(
    admin: TransactionSigner,
    globalConfig: TransactionSigner,
  ): Promise<string> {
    const ix = await this.createGlobalConfigIxs(admin, globalConfig);
    const sig = await this.executeTransaction(ix, admin, [globalConfig]);

    if (process.env.DEBUG === "true") {
      console.log("Initialize Global Config txn: " + sig.toString());
    }

    return sig;
  }

  /**
   * Get the create initialize vault instruction
   * @param user - the user address
   * @param mint - the mint address
   * @param mintTokenProgramId - the mint token program id
   * @param globalConfigOverride - the global config override
   * @returns the create initialize vault instruction
   */
  async initializeVaultIx(
    user: TransactionSigner,
    mint: Address,
    mintTokenProgramId?: Address,
  ): Promise<Instruction> {
    const mintProgramId = mintTokenProgramId
      ? mintTokenProgramId
      : (await this.getMintsProgramOwners([mint]))[0];

    const globalConfigState = await this.getGlobalConfigState();

    return limoOperations.initializeVault(
      user,
      this._globalConfig,
      mint,
      this.programAddress,
      mintProgramId,
    );
  }

  /**
   * Initialize the vault
   * @param user - the user keypair
   * @param mint - the mint address
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param mintTokenProgramId - the mint token program id
   * @param globalConfigOverride - the global config override
   * @returns the transaction signature
   */
  async initializeVault(
    user: TransactionSigner,
    mint: Address,
    mode: string = "execute",
    mintTokenProgramId?: Address,
  ): Promise<string> {
    const ix = await this.initializeVaultIx(user, mint, mintTokenProgramId);
    const vault = getTokenVaultPDA(
      this.programAddress,
      this._globalConfig,
      mint,
    );

    const log = "Initialize Vault: " + vault.toString();
    return this.processTxn(user, [ix], mode, log, []);
  }

  /**
   * Get the create initialize order instruction
   * @param user - the user address
   * @param inputMint - the input mint address
   * @param outputMint - the output mint address
   * @param inputAmountLamports - the input amount in lamports
   * @param outputAmountLamports - the output amount in lamports
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the create initialize order instruction and keypair to sign the transaction with
   * @throws error if mint decimals not found for mint
   */
  async createOrderGenericIx(
    user: TransactionSigner,
    inputMint: Address,
    outputMint: Address,
    inputAmountLamports: BN,
    outputAmountLamports: BN,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    globalConfigOverride?: Address,
    wrapUnwrapSol: boolean = true,
    withInitVault?: boolean,
  ): Promise<[Instruction[], TransactionSigner]> {
    let initVault: boolean;
    if (withInitVault === undefined) {
      try {
        const vaultPda = await getTokenVaultPDA(
          this.programAddress,
          this._globalConfig,
          inputMint,
        );
        const accountExists = await checkIfAccountExists(
          this._connection,
          vaultPda,
        );
        initVault = !accountExists;
      } catch (error) {
        initVault = false;
      }
    } else {
      initVault = withInitVault;
    }

    const order = await generateKeyPairSigner();
    const orderParams: limoOperations.OrderParams = {
      side: "bid",
      quoteTokenMint: outputMint,
      baseTokenMint: inputMint,
      quoteTokenAmount: outputAmountLamports,
      baseTokenAmount: inputAmountLamports,
    };

    const ixs: Instruction[] = [];

    if (initVault) {
      ixs.push(
        await limoOperations.initializeVault(
          user,
          this._globalConfig,
          inputMint,
          this.programAddress,
          inputMintProgramId,
        ),
      );
    }

    ixs.push(
      createKeypairRentExemptIxSync(
        user,
        order,
        Order.layout.span + 8,
        ORDER_RENT_EXEMPTION_LAMPORTS,
        this.programAddress,
      ),
    );

    const baseTokenMintProgramId = inputMintProgramId;
    const quoteTokenMintProgramId = outputMintProgramId;

    let closeWsolAtaIxs: Instruction[] = [];
    if (inputMint === WRAPPED_SOL_MINT && wrapUnwrapSol) {
      const { createIxs, fillIxs, closeIx } =
        await this.getInitIfNeededWSOLCreateAndCloseIxs(
          user,
          user,
          inputAmountLamports,
        );
      ixs.push(...createIxs, ...fillIxs);
      closeWsolAtaIxs = closeIx;
    }

    ixs.push(
      await limoOperations.createOrder(
        user,
        globalConfigOverride ? globalConfigOverride : this._globalConfig,
        order.address,
        orderParams,
        this.programAddress,
        baseTokenMintProgramId,
        quoteTokenMintProgramId,
      ),
    );

    ixs.push(...closeWsolAtaIxs);

    return [ixs, order];
  }

  /**
   * Get the create initialize order instruction
   * @param user - the user address
   * @param inputMint - the input mint address
   * @param outputMint - the output mint address
   * @param inputAmountLamports - the input amount in lamports
   * @param outputAmountLamports - the output amount in lamports
   * @param permissionless - whether the order is permissionless
   * @param counterparty - the counterparty address
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the create initialize order instruction and keypair to sign the transaction with
   * @throws error if mint decimals not found for mint
   */
  async createOrderGenericWithParamsIx(
    args: CreateOrderWithParamsArgs,
  ): Promise<[Instruction[], TransactionSigner]> {
    const {
      user,
      inputMint,
      outputMint,
      inputAmountLamports,
      outputAmountLamports,
      inputMintProgramId,
      outputMintProgramId,
      permissionless,
      counterparty,
      globalConfigOverride,
      wrapUnwrapSol = args.wrapUnwrapSol !== undefined
        ? args.wrapUnwrapSol
        : true,
      withInitVault,
    } = args;

    const [ixs, order] = await this.createOrderGenericIx(
      user,
      inputMint,
      outputMint,
      inputAmountLamports,
      outputAmountLamports,
      inputMintProgramId,
      outputMintProgramId,
      globalConfigOverride,
      wrapUnwrapSol,
      withInitVault,
    );

    if (permissionless) {
      const updateOrderPermissionlessIx = this.updateOrderIx(
        "UpdatePermissionless",
        true,
        user,
        globalConfigOverride ? globalConfigOverride : this._globalConfig,
        order.address,
      );
      ixs.push(...updateOrderPermissionlessIx);
    }

    if (counterparty) {
      const updateOrderCounterpartyIx = this.updateOrderIx(
        "UpdateCounterparty",
        counterparty,
        user,
        globalConfigOverride ? globalConfigOverride : this._globalConfig,
        order.address,
      );
      ixs.push(...updateOrderCounterpartyIx);
    }

    return [ixs, order];
  }

  async createOrderGenericWithParams(
    args: CreateOrderWithParamsArgs,
    user: TransactionSigner,
    mode: string = "execute",
  ): Promise<[string, TransactionSigner]> {
    const [ixs, order] = await this.createOrderGenericWithParamsIx(args);

    const log = "Create Order: " + order.address;
    const sig = await this.processTxn(user, ixs, mode, log, [order]);

    return [sig, order];
  }

  /**
   * Create an order
   * @param user - the user keypair
   * @param inputMint - the input mint address
   * @param outputMint - the output mint address
   * @param inputAmountLamports - the input amount in lamports
   * @param outputAmountLamports - the output amount in lamports
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the transaction signature and the order keypair
   */
  async createOrderGeneric(
    user: TransactionSigner,
    inputMint: Address,
    outputMint: Address,
    inputAmountLamports: BN,
    outputAmountLamports: BN,
    mode: string = "execute",
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    globalConfigOverride?: Address,
  ): Promise<[string, TransactionSigner]> {
    const [ixs, order] = await this.createOrderGenericIx(
      user,
      inputMint,
      outputMint,
      inputAmountLamports,
      outputAmountLamports,
      inputMintProgramId,
      outputMintProgramId,
      globalConfigOverride,
    );

    const log = "Create Order: " + order.address;
    const sig = await this.processTxn(user, ixs, mode, log, [order]);

    return [sig, order];
  }

  /**
   * Place a bid order instruction
   * @param user - the user address
   * @param quoteTokenMint - the quote token mint address
   * @param baseTokenMint - the base token mint address
   * @param baseUiAmount - the base amount in UI
   * @param price - the price
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the create order instruction and keypair to sign the transaction with
   */
  async placeBidIxs(
    user: TransactionSigner,
    quoteTokenMint: Address,
    baseTokenMint: Address,
    baseUiAmount: Decimal,
    price: Decimal,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<[Instruction[], TransactionSigner]> {
    let baseDecimals: number | undefined;
    let quoteDecimals: number | undefined;
    if (mintDecimals) {
      baseDecimals = mintDecimals.get(baseTokenMint);
      quoteDecimals = mintDecimals.get(quoteTokenMint);
    }
    baseDecimals = baseDecimals
      ? baseDecimals
      : await getMintDecimals(this._connection, baseTokenMint);
    quoteDecimals = quoteDecimals
      ? quoteDecimals
      : await getMintDecimals(this._connection, quoteTokenMint);

    return this.createOrderGenericIx(
      user,
      baseTokenMint,
      quoteTokenMint,
      amountToLamportsBN(baseUiAmount, baseDecimals),
      amountToLamportsBN(baseUiAmount.div(price), quoteDecimals),
      inputMintProgramId,
      outputMintProgramId,
      globalConfigOverride,
    );
  }

  /**
   * Place a bid order
   * @param user - the user keypair
   * @param quoteTokenMint - the quote token mint address
   * @param baseTokenMint - the base token mint address
   * @param baseUiAmount - the base amount in UI
   * @param price - the price
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the transaction signature and the order keypair
   */
  async placeBid(
    user: TransactionSigner,
    quoteTokenMint: Address,
    baseTokenMint: Address,
    baseUiAmount: Decimal,
    price: Decimal,
    mode: string = "execute",
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<[string, TransactionSigner]> {
    const [ixs, order] = await this.placeBidIxs(
      user,
      quoteTokenMint,
      baseTokenMint,
      baseUiAmount,
      price,
      inputMintProgramId,
      outputMintProgramId,
      mintDecimals,
      globalConfigOverride,
    );

    const log =
      "Place Order: Buy " +
      quoteTokenMint.toString().slice(0, 5) +
      " at price:" +
      price +
      " for " +
      baseUiAmount +
      " " +
      baseTokenMint.toString().slice(0, 5) +
      " Order: " +
      order.address;

    const sig = await this.processTxn(user, ixs, mode, log, [order]);

    return [sig, order];
  }

  /**
   * Place an ask order instruction
   * @param user - the user address
   * @param quoteTokenMint - the quote token mint address
   * @param baseTokenMint - the base token mint address
   * @param quoteUiAmount - the quote amount in UI
   * @param price - the price
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the create order instruction and keypair to sign the transaction with
   */
  async placeAskIxs(
    user: TransactionSigner,
    quoteTokenMint: Address,
    baseTokenMint: Address,
    quoteUiAmount: Decimal,
    price: Decimal,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<[Instruction[], TransactionSigner]> {
    let baseDecimals: number | undefined;
    let quoteDecimals: number | undefined;
    if (mintDecimals) {
      baseDecimals = mintDecimals.get(baseTokenMint);
      quoteDecimals = mintDecimals.get(quoteTokenMint);
    }
    baseDecimals = baseDecimals
      ? baseDecimals
      : await getMintDecimals(this._connection, baseTokenMint);
    quoteDecimals = quoteDecimals
      ? quoteDecimals
      : await getMintDecimals(this._connection, quoteTokenMint);

    return this.createOrderGenericIx(
      user,
      quoteTokenMint,
      baseTokenMint,
      amountToLamportsBN(quoteUiAmount, quoteDecimals),
      amountToLamportsBN(quoteUiAmount.mul(price), baseDecimals),
      inputMintProgramId,
      outputMintProgramId,
      globalConfigOverride,
    );
  }

  /**
   * Place an ask order
   * @param user - the user keypair
   * @param quoteTokenMint - the quote token mint address
   * @param baseTokenMint - the base token mint address
   * @param quoteUiAmount - the quote amount in UI
   * @param price - the price
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the transaction signature and the order keypair
   */
  async placeAsk(
    user: TransactionSigner,
    quoteTokenMint: Address,
    baseTokenMint: Address,
    quoteUiAmount: Decimal,
    price: Decimal,
    mode: string = "execute",
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    mintDecimals?: Map<Address, number>,
    globalConfigOverride?: Address,
  ): Promise<[string, TransactionSigner]> {
    const [ixs, order] = await this.placeAskIxs(
      user,
      quoteTokenMint,
      baseTokenMint,
      quoteUiAmount,
      price,
      inputMintProgramId,
      outputMintProgramId,
      mintDecimals,
      globalConfigOverride,
    );

    const log =
      "Place Order: Sell " +
      quoteTokenMint.toString().slice(0, 5) +
      " at price:" +
      price +
      " for " +
      quoteUiAmount +
      " " +
      baseTokenMint.toString().slice(0, 5) +
      " Order: " +
      order.address;

    const sig = await this.processTxn(user, ixs, mode, log, [order]);

    return [sig, order];
  }

  /**
   * Get the create take order instruction
   * @param taker - the taker address
   * @param order - the order state and address
   * @param inputAmountDecimals - the input amount in decimals
   * @param minOutputAmountDecimals - the minimum output amount in decimals
   * @param expressRelayProgramId - the express relay program id
   * @param inputMintDecimals - the input mint decimals
   * @param outputMintDecimals - the output mint decimals
   * @returns the create take order instruction
   */
  async takeOrderIx(
    taker: TransactionSigner,
    order: OrderStateAndAddress,
    inputAmountLamports: BN,
    minOutputAmountLamports: BN,
    expressRelayProgramId: Address,
    permissionlessTipLamports?: BN,
    permissionless?: boolean,
    wrapUnwrapSol: boolean = true,
  ): Promise<Instruction[]> {
    let ixs: Instruction[] = [];
    let closeWsolAtaIxs: Instruction[] = [];

    let takerInputAta: Address;
    if (order.state.inputMint === WRAPPED_SOL_MINT) {
      const {
        createIxs,
        fillIxs: _fill,
        closeIx,
        ata,
      } = await this.getInitIfNeededWSOLCreateAndCloseIxs(
        taker,
        taker,
        new BN(0),
      );
      takerInputAta = ata;
      if (wrapUnwrapSol) {
        ixs.push(...createIxs);
        closeWsolAtaIxs.push(...closeIx);
      }
    } else {
      const { ata, createAtaIx: createTakerInputAta } =
        await createAtaIdempotent(
          taker.address,
          taker,
          order.state.inputMint,
          order.state.inputMintProgramId,
        );
      takerInputAta = ata;
      ixs.push(createTakerInputAta);
    }

    let takerOutputAta: Address;
    if (order.state.outputMint === WRAPPED_SOL_MINT) {
      const outputExpectedOutForInputAmount = divCeil(
        order.state.expectedOutputAmount.mul(inputAmountLamports),
        order.state.initialInputAmount,
      );

      const { createIxs, fillIxs, closeIx, ata } =
        await this.getInitIfNeededWSOLCreateAndCloseIxs(
          taker,
          taker,
          outputExpectedOutForInputAmount,
        );
      takerOutputAta = ata;
      if (wrapUnwrapSol) {
        ixs.push(...createIxs, ...fillIxs);
        closeWsolAtaIxs.push(...closeIx);
      }
    } else {
      const { ata, createAtaIx: createTakerOutputAta } =
        await createAtaIdempotent(
          taker.address,
          taker,
          order.state.outputMint,
          order.state.outputMintProgramId,
        );
      takerOutputAta = ata;
      ixs.push(createTakerOutputAta);
    }

    let makerOutputAta: Address | undefined;
    let intermediaryOutputTokenAccount: Address | undefined;

    if (order.state.outputMint === WRAPPED_SOL_MINT) {
      makerOutputAta = undefined;
      intermediaryOutputTokenAccount = await getIntermediaryTokenAccountPDA(
        this.programAddress,
        order.address,
      );
    } else {
      // create maker ata
      const { ata, createAtaIx } = await createAtaIdempotent(
        order.state.maker,
        taker,
        order.state.outputMint,
        order.state.outputMintProgramId,
      );
      makerOutputAta = ata;
      ixs.push(createAtaIx);
      intermediaryOutputTokenAccount = undefined;
    }

    ixs.push(
      await limoOperations.takeOrder({
        taker,
        maker: order.state.maker,
        globalConfig: order.state.globalConfig,
        inputMint: order.state.inputMint,
        outputMint: order.state.outputMint,
        order: order.address,
        inputAmountLamports,
        minOutputAmountLamports,
        programAddress: this.programAddress,
        expressRelayProgramId,
        takerInputAta,
        takerOutputAta,
        intermediaryOutputTokenAccount,
        makerOutputAta,
        inputTokenProgram: order.state.inputMintProgramId,
        outputTokenProgram: order.state.outputMintProgramId,
        permissionlessTipLamports:
          permissionlessTipLamports !== undefined
            ? permissionlessTipLamports
            : new BN(0),
        permissionless: permissionless !== undefined ? permissionless : false,
      }),
    );

    ixs.push(...closeWsolAtaIxs);
    return ixs;
  }

  /**
   * Take an order
   * @param crank - the crank keypair
   * @param order - the order state and address
   * @param inputAmountDecimals - the input amount in decimals
   * @param outputAmountDecimals - the output amount in decimals
   * @param expressRelayProgramId - the express relay program id
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @returns the transaction signature
   */
  async permissionlessTakeOrder(
    crank: TransactionSigner,
    order: OrderStateAndAddress,
    inputAmountLamports: BN,
    outputAmountLamports: BN,
    expressRelayProgramId: Address,
    mode: string,
    permissionlessTipLamports: BN,
    mintDecimals?: Map<Address, number>,
  ): Promise<string> {
    let inputMintDecimals: number | undefined;
    let outputMintDecimals: number | undefined;
    if (mintDecimals) {
      inputMintDecimals = mintDecimals.get(order.state.inputMint);
      outputMintDecimals = mintDecimals.get(order.state.outputMint);
    }
    inputMintDecimals = inputMintDecimals
      ? inputMintDecimals
      : await getMintDecimals(this._connection, order.state.inputMint);
    outputMintDecimals = outputMintDecimals
      ? outputMintDecimals
      : await getMintDecimals(this._connection, order.state.outputMint);

    const ixs = await this.takeOrderIx(
      crank,
      order,
      inputAmountLamports,
      outputAmountLamports,
      expressRelayProgramId,
      permissionlessTipLamports,
      true,
    );

    const outputExpectedOutForInputAmount = divCeil(
      order.state.expectedOutputAmount.mul(inputAmountLamports),
      order.state.initialInputAmount,
    );

    const log =
      "Taker Order: " +
      order.address +
      " selling " +
      lamportsToAmountBN(inputAmountLamports, inputMintDecimals).toString() +
      " token ";
    order.state.inputMint.slice(0, 5) +
      " for " +
      lamportsToAmountBN(
        outputExpectedOutForInputAmount,
        outputMintDecimals,
      ).toString() +
      " token " +
      order.state.outputMint.slice(0, 5);

    const sig = await this.processTxn(crank, ixs, mode, log, []);

    return sig;
  }

  /**
   * Get the create flash take order instruction
   * @param taker - the taker address
   * @param order - the order state and address
   * @param inputAmountDecimal - the input amount in decimals
   * @param minOutputAmountDecimal - the minimum output amount in decimals
   * @param expressRelayProgramId - the express relay program id
   * @param inputMintDecimals - the input mint decimals
   * @param outputMintDecimals - the output mint decimals
   * @param permissionlessTipLamports - the tip in lamports for permissionless flash_take_order
   * @param permissionless - whether the flash take order should be a permissionless call
   * @returns the create flash take order instruction - in between the start and
   * end flash take order instructions, the swap and permissioning logic should exist
   */
  async flashTakeOrderIxs(
    taker: TransactionSigner,
    order: OrderStateAndAddress,
    inputAmountLamports: BN,
    minOutputAmountLamports: BN,
    expressRelayProgramId: Address,
    permissionlessTipLamports?: BN,
    permissionless?: boolean,
    wrapUnwrapSol: boolean = true,
  ): Promise<FlashTakeOrderIxs> {
    let createAtaIxs: Instruction[] = [];
    let closeWsolAtaIxs: Instruction[] = [];

    let takerInputAta: Address;
    if (order.state.inputMint === WRAPPED_SOL_MINT) {
      const {
        createIxs,
        fillIxs: _fill,
        closeIx,
        ata,
      } = await this.getInitIfNeededWSOLCreateAndCloseIxs(
        taker,
        taker,
        new BN(0),
      );
      takerInputAta = ata;
      if (wrapUnwrapSol) {
        createAtaIxs.push(...createIxs);
        closeWsolAtaIxs.push(...closeIx);
      }
    } else {
      const { ata, createAtaIx: createTakerInputAta } =
        await createAtaIdempotent(
          taker.address,
          taker,
          order.state.inputMint,
          order.state.inputMintProgramId,
        );
      takerInputAta = ata;
      createAtaIxs.push(createTakerInputAta);
    }

    let takerOutputAta: Address;
    if (order.state.outputMint === WRAPPED_SOL_MINT) {
      const outputExpectedOutForInputAmount = divCeil(
        order.state.expectedOutputAmount.mul(inputAmountLamports),
        order.state.initialInputAmount,
      );

      const {
        createIxs,
        fillIxs: _fillIxs,
        closeIx,
        ata,
      } = await this.getInitIfNeededWSOLCreateAndCloseIxs(
        taker,
        taker,
        outputExpectedOutForInputAmount,
      );
      takerOutputAta = ata;
      if (wrapUnwrapSol) {
        createAtaIxs.push(...createIxs);
        closeWsolAtaIxs.push(...closeIx);
      }
    } else {
      const { ata, createAtaIx: createTakerOutputAta } =
        await createAtaIdempotent(
          taker.address,
          taker,
          order.state.outputMint,
          order.state.outputMintProgramId,
        );
      takerOutputAta = ata;
      createAtaIxs.push(createTakerOutputAta);
    }

    let makerOutputAta: Address | undefined;
    let intermediaryOutputTokenAccount: Address | undefined;

    if (order.state.outputMint === WRAPPED_SOL_MINT) {
      makerOutputAta = undefined;
      intermediaryOutputTokenAccount = await getIntermediaryTokenAccountPDA(
        this.programAddress,
        order.address,
      );
    } else {
      // create maker ata
      const { ata, createAtaIx } = await createAtaIdempotent(
        order.state.maker,
        taker,
        order.state.outputMint,
        order.state.outputMintProgramId,
      );
      makerOutputAta = ata;
      createAtaIxs.push(createAtaIx);
      intermediaryOutputTokenAccount = undefined;
    }

    const { startIx: startFlashIx, endIx: endFlashIx } =
      await limoOperations.flashTakeOrder({
        taker,
        maker: order.state.maker,
        globalConfig: order.state.globalConfig,
        inputMint: order.state.inputMint,
        outputMint: order.state.outputMint,
        order: order.address,
        inputAmountLamports,
        minOutputAmountLamports,
        programAddress: this.programAddress,
        expressRelayProgramId,
        takerInputAta,
        takerOutputAta,
        intermediaryOutputTokenAccount,
        makerOutputAta,
        inputTokenProgram: order.state.inputMintProgramId,
        outputTokenProgram: order.state.outputMintProgramId,
        permissionlessTipLamports:
          permissionlessTipLamports !== undefined
            ? permissionlessTipLamports
            : new BN(0),
        permissionless: permissionless !== undefined ? permissionless : false,
      });

    return {
      createAtaIxs,
      startFlashIx,
      endFlashIx,
      closeWsolAtaIxs: closeWsolAtaIxs,
    };
  }

  /**
   * Flash take an order
   * @param crank - the crank keypair
   * @param order - the order state and address
   * @param inputAmountLamports - the input amount in lamports
   * @param outputAmountLamports - the output amount in lamports
   * @param expressRelayProgramId - the express relay program id
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param swapIxs
   * @param permissionlessTipLamports
   * @param extraSigners
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @returns the transaction signature
   */
  async permissionlessFlashTakeOrder(
    crank: TransactionSigner,
    order: OrderStateAndAddress,
    inputAmountLamports: BN,
    outputAmountLamports: BN,
    expressRelayProgramId: Address,
    mode: string,
    swapIxs: Instruction[],
    permissionlessTipLamports: BN,
    extraSigners: TransactionSigner[],
    mintDecimals?: Map<Address, number>,
  ): Promise<string> {
    let inputMintDecimals: number | undefined;
    let outputMintDecimals: number | undefined;
    if (mintDecimals) {
      inputMintDecimals = mintDecimals.get(order.state.inputMint);
      outputMintDecimals = mintDecimals.get(order.state.outputMint);
    }
    inputMintDecimals = inputMintDecimals
      ? inputMintDecimals
      : await getMintDecimals(this._connection, order.state.inputMint);
    outputMintDecimals = outputMintDecimals
      ? outputMintDecimals
      : await getMintDecimals(this._connection, order.state.outputMint);

    const { createAtaIxs, startFlashIx, endFlashIx, closeWsolAtaIxs } =
      await this.flashTakeOrderIxs(
        crank,
        order,
        inputAmountLamports,
        outputAmountLamports,
        expressRelayProgramId,
        permissionlessTipLamports,
        true,
      );

    const outputExpectedOutForInputAmount = divCeil(
      order.state.expectedOutputAmount.mul(inputAmountLamports),
      order.state.initialInputAmount,
    );

    const log =
      "Taker Order: " +
      order.address +
      " selling " +
      lamportsToAmountBN(inputAmountLamports, inputMintDecimals).toString() +
      " token ";
    order.state.inputMint.slice(0, 5) +
      " for " +
      lamportsToAmountBN(
        outputExpectedOutForInputAmount,
        outputMintDecimals,
      ).toString() +
      " token " +
      order.state.outputMint.slice(0, 5);

    const sig = await this.processTxn(
      crank,
      [
        ...createAtaIxs,
        startFlashIx,
        ...swapIxs,
        endFlashIx,
        ...closeWsolAtaIxs,
      ] satisfies Instruction[],
      mode,
      log,
      extraSigners,
      300_000,
    );

    return sig;
  }

  /**
   * Get the create close order instruction
   * @param user - the user address
   * @param inputMint - the inputMint for the swap
   * @param outputMint - the outputMint for the swap
   * @param inputTa - the input mint token account
   * @param outputTa - the output mint token account
   * @returns the log ixs - to be used once at the beginning and once at the end
   */
  async logUserSwapBalancesIxs(args: LogUserSwapBalancesIxArgs): Promise<{
    beforeSwapIx: Instruction;
    afterSwapIx: Instruction;
  }> {
    const {
      user,
      inputMint,
      outputMint,
      inputTa,
      outputTa,
      swapProgarmId,
      simulatedSwapAmountOut,
      simulatedTs,
      minimumAmountOut,
      swapAmountIn,
      simulatedAmountOutNextBest,
      aggregatorId,
      nextBestAggregatorId,
      pdaReferrer = args.pdaReferrer ?? this.programAddress,
      voteAccount,
    } = args;

    const logIxStart = logUserSwapBalancesStart({
      baseAccounts: {
        maker: user,
        inputMint,
        outputMint,
        inputTa,
        outputTa,
        pdaReferrer: asOption(pdaReferrer),
        swapProgramId: swapProgarmId,
      },
      userSwapBalanceState: await getUserSwapBalanceStatePDA(
        user.address,
        this.programAddress,
      ),
      eventAuthority: await getEventAuthorityPDA(this.programAddress),
      program: this.programAddress,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
    });

    const padding: number[] = Array(2).fill(0);

    const logIxEnd = logUserSwapBalancesEnd(
      {
        simulatedSwapAmountOut,
        simulatedTs,
        minimumAmountOut,
        swapAmountIn,
        simulatedAmountOutNextBest,
        aggregator: aggregatorId,
        nextBestAggregator: nextBestAggregatorId,
        padding,
      },
      {
        baseAccounts: {
          maker: user,
          inputMint,
          outputMint,
          inputTa,
          outputTa,
          pdaReferrer: asOption(pdaReferrer),
          swapProgramId: swapProgarmId,
        },
        userSwapBalanceState: await getUserSwapBalanceStatePDA(
          user.address,
          this.programAddress,
        ),
        eventAuthority: await getEventAuthorityPDA(this.programAddress),
        program: this.programAddress,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        rent: SYSVAR_RENT_ADDRESS,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
    );

    let finalLogIxStart: Instruction;
    let finalLogIxEnd: Instruction;
    if (voteAccount) {
      const voteAccountMetadata = {
        address: voteAccount,
        role: AccountRole.READONLY,
      } satisfies AccountMeta;
      finalLogIxStart = {
        data: logIxStart.data,
        programAddress: logIxStart.programAddress,
        accounts: [
          ...Array.from(logIxStart.accounts || []),
          voteAccountMetadata,
        ],
      };
      finalLogIxEnd = {
        data: logIxEnd.data,
        programAddress: logIxEnd.programAddress,
        accounts: [...Array.from(logIxEnd.accounts || []), voteAccountMetadata],
      };
    } else {
      finalLogIxStart = logIxStart;
      finalLogIxEnd = logIxEnd;
    }

    return {
      beforeSwapIx: finalLogIxStart,
      afterSwapIx: finalLogIxEnd,
    };
  }

  /**
   * Get the create close order instruction
   * @param user - the user address
   * @param inputMint - the inputMint for the swap
   * @param outputMint - the outputMint for the swap
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @returns the log ixs - to be used once at the beginning and once at the end
   */
  async logUserSwapBalances(
    user: TransactionSigner,
    inputMint: Address,
    outputMint: Address,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    setupIxs: Instruction[] = [],
    mockSwapIxs: Instruction[] = [],
    mockSwapSigners: TransactionSigner[] = [],
    swapProgarmId: Address,
    voteAccount?: Address,
  ): Promise<string> {
    const [inputTa] = await findAssociatedTokenPda({
      mint: inputMint,
      owner: user.address,
      tokenProgram: inputMintProgramId,
    });
    const [outputTa] = await findAssociatedTokenPda({
      mint: outputMint,
      owner: user.address,
      tokenProgram: outputMintProgramId,
    });
    const { beforeSwapIx, afterSwapIx } = await this.logUserSwapBalancesIxs({
      user: user,
      inputMint,
      outputMint,
      inputTa,
      outputTa,
      swapProgarmId,
      simulatedSwapAmountOut: new BN(0),
      simulatedTs: new BN(0),
      minimumAmountOut: new BN(0),
      swapAmountIn: new BN(0),
      simulatedAmountOutNextBest: new BN(0),
      aggregatorId: 0,
      nextBestAggregatorId: 0,
      pdaReferrer: this.programAddress,
      voteAccount,
    });

    const sig = await this.processTxn(
      user,
      [...setupIxs, beforeSwapIx, ...mockSwapIxs, afterSwapIx],
      "execute",
      "",
      mockSwapSigners,
      300_000,
    );

    console.log("logUserSwapBalances", sig);

    return sig;
  }

  /**
   * Get the create close order instruction
   * @param user - the user address
   * @param inputMont - the inputMint for the swap
   * @param outputMint - the outputMint for the swap
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @returns the log ixs - to be used once at the beginning and once at the end
   */
  async assertUserSwapBalancesIxs(args: AssertUserSwapBalancesIxArgs): Promise<{
    beforeSwapIx: Instruction;
    afterSwapIx: Instruction;
  }> {
    const {
      user,
      inputMint,
      outputMint,
      inputMintProgramId,
      outputMintProgramId,
      maxInputAmountChange,
      minOutputAmountChange,
      inputTa,
      outputTa,
    } = args;
    let inputMintTa: Address;
    if (inputTa) {
      inputMintTa = inputTa;
    } else if (inputMint && inputMintProgramId) {
      [inputMintTa] = await findAssociatedTokenPda({
        mint: inputMint,
        owner: user.address,
        tokenProgram: inputMintProgramId,
      });
    } else {
      throw new Error(
        "Input mint and program ID must be provided if inputTa is not given",
      );
    }

    let outputMintTa: Address;
    if (outputTa) {
      outputMintTa = outputTa;
    } else if (outputMint && outputMintProgramId) {
      [outputMintTa] = await findAssociatedTokenPda({
        mint: outputMint,
        owner: user.address,
        tokenProgram: outputMintProgramId,
      });
    } else {
      throw new Error(
        "Output mint and program ID must be provided if outputTa is not given",
      );
    }

    const userSwapBalanceState = await getUserSwapBalanceAssertStatePDA(
      user.address,
      this.programAddress,
    );

    const logIxStart = assertUserSwapBalancesStart({
      maker: user,
      inputTa: inputMintTa,
      outputTa: outputMintTa,
      userSwapBalanceState,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      rent: SYSVAR_RENT_ADDRESS,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
    });

    const logIxEnd = assertUserSwapBalancesEnd(
      {
        maxInputAmountChange,
        minOutputAmountChange,
      },
      {
        maker: user,
        inputTa: inputMintTa,
        outputTa: outputMintTa,
        userSwapBalanceState,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        rent: SYSVAR_RENT_ADDRESS,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
      },
    );

    return {
      beforeSwapIx: logIxStart,
      afterSwapIx: logIxEnd,
    };
  }

  /**
   * Get the create close order instruction
   * @param user - the user address
   * @param inputMont - the inputMint for the swap
   * @param outputMint - the outputMint for the swap
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @returns the log ixs - to be used once at the beginning and once at the end
   */
  async assertUserSwapBalances(
    user: TransactionSigner,
    inputMint: Address,
    outputMint: Address,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    maxInputAmountChange: BN,
    minOutputAmountChange: BN,
    setupIxs: Instruction[] = [],
    mockSwapIxs: Instruction[] = [],
    mockSwapSigners: TransactionSigner[] = [],
  ): Promise<string> {
    const { beforeSwapIx, afterSwapIx } = await this.assertUserSwapBalancesIxs({
      user,
      inputMint,
      outputMint,
      inputMintProgramId,
      outputMintProgramId,
      maxInputAmountChange,
      minOutputAmountChange,
    });

    const sig = await this.processTxn(
      user,
      [...setupIxs, beforeSwapIx, ...mockSwapIxs, afterSwapIx],
      "execute",
      "",
      mockSwapSigners,
      300_000,
    );

    console.log("assertUserSwapBalances", sig);

    return sig;
  }

  /**
   * Get the total tips for all filled orders from the given orders array
   * @param orders - the list of orders to filter by filled and calculate the total tips
   * @returns the decimal amount of native sol tips
   */
  getTotalTipsForFilledOrdersDecimal(orders: OrderDisplay[]): Decimal {
    let totalTipsForFilledOrdersLamports = new Decimal(0);
    for (const order of orders) {
      if (order.state.status === 1) {
        // Filled
        totalTipsForFilledOrdersLamports = totalTipsForFilledOrdersLamports.add(
          order.orderTipDecimal,
        );
      }
    }
    return totalTipsForFilledOrdersLamports;
  }

  /**
   * Get the all instructions to close and claim tips for all filled orders from the given orders array
   * @param maker - the maker address to close and claim tips for
   * @param orders - the list of orders to filter by filled and calculate the total tips
   * @returns an array of arrays of instructions to close and claim tips for all filled orders -
   * this should be used as multiple transactions
   */
  async getCloseAndClaimTipsForFilledOrdersTxsIxs(
    maker: TransactionSigner,
    orders: OrderDisplay[],
    batchSize: number = MAX_CLOSE_ORDER_AND_CLAIM_TIP_ORDERS_IN_TX,
  ): Promise<Instruction[][]> {
    let ixsArrays: Instruction[][] = [];
    ixsArrays.push([]);

    for (const order of orders) {
      if (order.state.status === 1) {
        // Filled
        const orderStateAndAddress: OrderStateAndAddress = {
          state: order.state,
          address: order.address,
        };

        const ixs = await this.closeOrderAndClaimTipIx(
          maker,
          orderStateAndAddress,
        );

        // Once the batchSize of previous array is hit, create a new array
        if (ixsArrays[ixsArrays.length - 1].length + ixs.length > batchSize) {
          ixsArrays.push([]);
        }

        ixsArrays[ixsArrays.length - 1].push(...ixs);
      }
    }

    return ixsArrays;
  }

  /**
   * Get the create close order and claim tip instruction
   * @param maker - the maker address
   * @param order - the order state and address
   * @returns the create close order and claim tip instruction
   */
  async closeOrderAndClaimTipIx(
    maker: TransactionSigner,
    order: OrderStateAndAddress,
    wrapUnwrapSol: boolean = true,
  ): Promise<Instruction[]> {
    let ixs: Instruction[] = [];
    let closeWsolAtaIxs: Instruction[] = [];
    let makerInputAta: Address;
    if (order.state.inputMint === WRAPPED_SOL_MINT) {
      const {
        createIxs,
        fillIxs: _fill,
        closeIx,
        ata,
      } = await this.getInitIfNeededWSOLCreateAndCloseIxs(
        maker,
        maker,
        new BN(0),
      );
      makerInputAta = ata;
      if (wrapUnwrapSol) {
        ixs.push(...createIxs);
        closeWsolAtaIxs.push(...closeIx);
      }
    } else {
      const { ata, createAtaIx: createMakerInputAta } =
        await createAtaIdempotent(
          maker.address,
          maker,
          order.state.inputMint,
          order.state.inputMintProgramId,
        );
      makerInputAta = ata;
      ixs.push(createMakerInputAta);
    }

    ixs.push(
      await limoOperations.closeOrderAndClaimTip({
        maker: maker,
        globalConfig: order.state.globalConfig,
        inputMint: order.state.inputMint,
        outputMint: order.state.outputMint,
        order: order.address,
        programAddress: this.programAddress,
        makerInputAta,
        inputTokenProgram: order.state.inputMintProgramId,
      }),
    );

    ixs.push(...closeWsolAtaIxs);

    return ixs;
  }

  /**
   * Close an order and claim tip
   * @param maker - the maker keypair
   * @param order - the order state and address
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param mintDecimals - map of mint addresses and their number of decimals
   * @returns the transaction signature
   */
  async closeOrderAndClaimTip(
    maker: TransactionSigner,
    order: OrderStateAndAddress,
    mode: string,
    mintDecimals?: Map<Address, number>,
  ): Promise<string> {
    let ixs = await this.closeOrderAndClaimTipIx(maker, order);

    let inputMintDecimals: number | undefined;
    let tipMintDecimals: number | undefined;
    if (mintDecimals) {
      inputMintDecimals = mintDecimals.get(order.state.inputMint);
      tipMintDecimals = mintDecimals.get(WRAPPED_SOL_MINT);
    }
    inputMintDecimals = inputMintDecimals
      ? inputMintDecimals
      : await getMintDecimals(this._connection, order.state.inputMint);
    tipMintDecimals = tipMintDecimals
      ? tipMintDecimals
      : await getMintDecimals(this._connection, WRAPPED_SOL_MINT);

    const log =
      "Close Order: " +
      order.address.toString() +
      " claiming " +
      lamportsToAmountBN(
        order.state.remainingInputAmount,
        inputMintDecimals,
      ).toString() +
      " input token ";
    order.state.inputMint.toString().slice(0, 5) +
      " and " +
      lamportsToAmountBN(order.state.tipAmount, tipMintDecimals).toString();
    (" tip ");

    const sig = await this.processTxn(maker, ixs, mode, log, []);

    return sig;
  }

  /**
   * Get the update order instructions - close current order and initialize new order
   * @param order - the order state to close
   * @param user - the user address
   * @param inputMint - the input mint address
   * @param outputMint - the output mint address
   * @param inputAmountLamports - the input amount in lamports
   * @param outputAmountLamports - the output amount in lamports
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param globalConfigOverride - the global config override
   * @returns the create initialize order instruction and keypair to sign the transaction with
   * @throws error if mint decimals not found for mint
   */
  async updateOrderGenericIx(
    order: OrderStateAndAddress,
    user: TransactionSigner,
    inputMint: Address,
    outputMint: Address,
    inputAmountLamports: BN,
    outputAmountLamports: BN,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    globalConfigOverride?: Address,
    wrapUnwrapSol: boolean = true,
  ): Promise<[Instruction[], TransactionSigner]> {
    let closeOrderIx = await this.closeOrderAndClaimTipIx(
      user,
      order,
      wrapUnwrapSol,
    );

    let [createOrderIx, orderKeypair] = await this.createOrderGenericIx(
      user,
      inputMint,
      outputMint,
      inputAmountLamports,
      outputAmountLamports,
      inputMintProgramId,
      outputMintProgramId,
      globalConfigOverride,
    );

    return [[...closeOrderIx, ...createOrderIx], orderKeypair];
  }

  /**
   * Get the update order instructions - close current order and initialize new order
   * @param order - the order state to close
   * @param user - the user keypair
   * @param inputMint - the input mint address
   * @param outputMint - the output mint address
   * @param inputAmountLamports - the input amount in lamports
   * @param outputAmountLamports - the output amount in lamports
   * @param inputMintProgramId - the input mint program id
   * @param outputMintProgramId - the output mint program id
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param globalConfigOverride - the global config override
   * @returns the create initialize order instruction and keypair to sign the transaction with
   * @throws error if mint decimals not found for mint
   */
  async updateOrderGeneric(
    order: OrderStateAndAddress,
    user: TransactionSigner,
    inputMint: Address,
    outputMint: Address,
    inputAmountLamports: BN,
    outputAmountLamports: BN,
    inputMintProgramId: Address,
    outputMintProgramId: Address,
    mode: string = "execute",
    globalConfigOverride?: Address,
    wrapUnwrapSol: boolean = true,
  ): Promise<[string, TransactionSigner]> {
    const [ixs, orderKp] = await this.updateOrderGenericIx(
      order,
      user,
      inputMint,
      outputMint,
      inputAmountLamports,
      outputAmountLamports,
      inputMintProgramId,
      outputMintProgramId,
      globalConfigOverride,
      wrapUnwrapSol,
    );

    const log =
      "Update order: " +
      "closing order: " +
      order.toString() +
      " and creating order " +
      orderKp.address;

    const sig = await this.processTxn(user, ixs, mode, log, [orderKp]);

    return [sig, orderKp];
  }

  updateOrderIx(
    mode: string,
    value: boolean | Address,
    maker: TransactionSigner,
    globalConfig: Address,
    order: Address,
  ) {
    const ixs: Instruction[] = [];

    ixs.push(
      limoOperations.updateOrder(
        UpdateOrderMode.fromDecoded({ [mode]: "" }),
        value,
        maker,
        globalConfig,
        order,
        this.programAddress,
      ),
    );

    return ixs;
  }

  updateOrder(
    maker: TransactionSigner,
    updateMode: string,
    value: boolean | Address,
    order: Address,
    mode: string,
  ): Promise<string> {
    const ixs = this.updateOrderIx(
      updateMode,
      value,
      maker,
      this._globalConfig,
      order,
    );

    const log = `Update order: ${order.toString()} with mode ${updateMode} and value ${value.toString()}`;

    console.log("updateOrder", log);

    return this.processTxn(maker, ixs, mode, log, []);
  }

  /**
   * Get the update global config instruction
   * @param admin - the admin address
   * @param mode - the mode to update
   * @param value - the value
   * @param globalConfigOverride - the global config override
   * @returns the update global config instruction
   */
  async updateGlobalConfigIx(
    admin: TransactionSigner,
    mode: string,
    value: number | Address,
    globalConfigOverride?: Address,
  ): Promise<Instruction[]> {
    const ixs: Instruction[] = [];

    ixs.push(
      limoOperations.updateGlobalConfigIx(
        admin,
        globalConfigOverride ? globalConfigOverride : this._globalConfig,
        UpdateGlobalConfigMode.fromDecoded({ [mode]: "" }),
        value,
        this.programAddress,
      ),
    );

    return ixs;
  }

  /**
   * Update the global config
   * @param admin - the admin keypair
   * @param updateMode - the update mode
   * @param value - the value
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param globalConfigOverride - the global config override
   * @returns the transaction signature
   */
  async updateGlobalConfig(
    admin: TransactionSigner,
    updateMode: string,
    value: number | Address,
    mode: string,
    globalConfigOverride?: Address,
  ): Promise<string> {
    await this.getGlobalConfigState();
    const ixs = await this.updateGlobalConfigIx(
      admin,
      updateMode,
      value,
      globalConfigOverride,
    );

    const log =
      "Update global config: " +
      this._globalConfig +
      " with mode " +
      updateMode +
      " and value " +
      value.toString();

    console.log("updateGlobalConfig", log);

    const sig = await this.processTxn(admin, ixs, mode, log, []);

    return sig;
  }

  /**
   * Get the update global config admin instruction - should be signed by the current globalConfig.adminAuthorityCached
   * @returns the update global config admin instruction
   */
  async updateGlobalConfigAdminIx(
    admin: TransactionSigner,
  ): Promise<Instruction> {
    const globalConfigState = await this.getGlobalConfigState();

    if (!globalConfigState) {
      throw new Error("Global config not found");
    }

    const ix = limoOperations.updateGlobalConfigAdminIx(
      admin,
      this._globalConfig,
      globalConfigState,
      this.programAddress,
    );

    return ix;
  }

  /**
   * Update the global config admin
   * @param admin - the admin keypair, should match the current globalConfig.adminAuthorityCached
   * @param mode - the execution mode (simulate/execute/multisig)
   * @returns the transaction signature
   */
  async updateGlobalConfigAdmin(
    admin: TransactionSigner,
    mode: string,
  ): Promise<string> {
    const ix = await this.updateGlobalConfigAdminIx(admin);

    const log =
      "Update global config admin: " +
      this._globalConfig +
      " with admin " +
      admin.address;

    const sig = await this.processTxn(admin, [ix], mode, log, []);

    return sig;
  }

  /**
   * Get the withdraw host tip instruction
   * @param admin - the admin address
   * @param globalConfigOverride - the global config override
   * @returns the withdraw host tip instruction
   */
  async withdrawHostTipIx(
    admin: TransactionSigner,
    globalConfigOverride?: Address,
  ): Promise<Instruction[]> {
    let ixs: Instruction[] = [];

    ixs.push(
      await withdrawHostTipIx({
        admin,
        globalConfig: globalConfigOverride
          ? globalConfigOverride
          : this._globalConfig,
        programAddress: this.programAddress,
      }),
    );

    return ixs;
  }

  /**
   * Withdraw the host tip
   * @param admin - the admin keypair
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param globalConfigOverride - the global config override
   * @returns the transaction signature
   */
  async withdrawHostTip(
    admin: TransactionSigner,
    mode: string,
    globalConfigOverride?: Address,
  ): Promise<Instruction[]> {
    const ixs = await this.withdrawHostTipIx(admin, globalConfigOverride);

    const log =
      "Withdraw host tip: " +
      this._globalConfig.toString() +
      " with admin " +
      admin.address;

    const sig = await this.processTxn(admin, ixs, mode, log, []);

    return ixs;
  }

  /**
   * Get the number of decimals for the order input mint
   * @param order - the order state and address
   * @returns the number of decimals
   */
  async getOrderInputMintDecimals(
    order: OrderStateAndAddress,
  ): Promise<number> {
    return await getMintDecimals(this._connection, order.state.inputMint);
  }

  /**
   * Get the number of decimals for the order output mint
   * @param order - the order state and address
   * @returns the number of decimals
   */
  async getOrderOutputMintDecimals(
    order: OrderStateAndAddress,
  ): Promise<number> {
    return await getMintDecimals(this._connection, order.state.outputMint);
  }

  /**
   * Get the number of decimals for given mints array
   * @param mints - an array of mints
   * @returns a PubkeyHashMap of the mints and number of decimals
   */
  async getMintDecimals(mints: Address[]): Promise<Map<Address, number>> {
    const mintDecimals = new Map<Address, number>();
    for (const mint of mints) {
      mintDecimals.set(mint, await getMintDecimals(this._connection, mint));
    }
    return mintDecimals;
  }

  /**
   * Get the number of decimals for all mints in all of the order states
   * @returns a PubkeyHashMap of the mints and number of decimals
   */
  async getAllMintDecimals(): Promise<Map<Address, number>> {
    const allOrders = await this.getAllOrdersStateAndAddressWithFilters(
      [],
      undefined,
      false,
    );
    const mints: Address[] = [];
    for (const order of allOrders) {
      mints.push(order.state.inputMint);
      mints.push(order.state.outputMint);
    }

    return await this.getMintDecimals(mints);
  }

  async getMintsProgramOwners(mints: Address[]): Promise<Address[]> {
    const mintAccounts = await this._connection
      .getMultipleAccounts(mints)
      .send();

    const mintProgramIds = mintAccounts.value.map((mintAccount) => {
      if (!mintAccount) {
        throw new Error("Mint not found");
      }
      return mintAccount.owner;
    });

    return mintProgramIds;
  }

  /**
   * Execute a transaction
   * @param ix - the transaction instructions
   * @param signer - the signer keypair
   * @param extraSigners - the extra signers
   * @returns the transaction signature
   */
  async executeTransaction(
    instructions: Instruction[],
    signer: TransactionSigner,
    extraSigners: TransactionSigner[] = [],
  ): Promise<string> {
    const { value: latestBlockhash } = await this._connection
      .getLatestBlockhash()
      .send();

    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }), // Create transaction message
      (tx) => setTransactionMessageFeePayerSigner(signer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions(instructions, tx),
    );

    const transactionsMessageWithSigners = extraSigners
      ? addSignersToTransactionMessage(extraSigners, transactionMessage)
      : transactionMessage;

    const signedTransaction = await signTransactionMessageWithSigners(
      transactionsMessageWithSigners,
    );

    await sendAndConfirmTransactionFactory({
      rpc: this._connection,
      rpcSubscriptions: this._subscription,
    })(signedTransaction, { commitment: "confirmed" });

    return getSignatureFromTransaction(signedTransaction);
  }

  /**
   * Process a transaction based on the execution mode
   * @param admin - the admin keypair
   * @param instructions - the transaction instructions
   * @param mode - the execution mode (simulate/execute/multisig)
   * @param debugMessage - the debug message
   * @param extraSigners - the extra signers
   * @param computeUnits - the number of compute units
   * @param priorityFeeLamports - the priority fee in lamports
   * @returns the transaction signature
   */
  async processTxn(
    admin: TransactionSigner,
    instructions: Instruction[],
    mode: string,
    debugMessage?: string,
    extraSigners?: TransactionSigner[],
    computeUnits: number = 200_000,
    priorityFeeLamports: number = 10000,
  ): Promise<string> {
    if (mode === "multisig" || mode === "simulate") {
      const { value: latestBlockhash } = await this._connection
        .getLatestBlockhash()
        .send();

      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }), // Create transaction message
        (tx) => setTransactionMessageFeePayerSigner(admin, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
      );

      const transactionsMessageWithSigners = extraSigners
        ? addSignersToTransactionMessage(extraSigners, transactionMessage)
        : transactionMessage;

      const signedTransaction = await signTransactionMessageWithSigners(
        transactionsMessageWithSigners,
      );

      // if simulate is true, always simulate
      if (mode === "simulate") {
        await printSimulateTx(this._connection, signedTransaction);
      } else {
        // if simulate is false (multisig is true)
        await printMultisigTx(signedTransaction);
      }

      return "";
    } else if (mode === "execute") {
      const microLamport = priorityFeeLamports * 10 ** 6; // 1000 lamports
      const microLamportsPrioritizationFee = microLamport / computeUnits;
      const priorityFeeIxs = createAddExtraComputeUnitFeeTransaction(
        computeUnits,
        microLamportsPrioritizationFee,
      );

      const sig = await this.executeTransaction(
        [...priorityFeeIxs, ...instructions],
        admin,
        extraSigners,
      );

      if (process.env.DEBUG === "true" && debugMessage) {
        console.log(debugMessage);
        console.log("txn: " + sig.toString());
      }

      return sig;
    }

    console.log(debugMessage);

    return "";
  }

  /**
   * Get the wsol create fill and close ixs for a given owner and payer
   * @param owner - the owner address
   * @param payer - the payer address
   * @param amountToDepositLamports - the amount to deposit in lamports
   * @returns the create, fill, and close instructions, toghether with the ata
   */
  async getInitIfNeededWSOLCreateAndCloseIxs(
    owner: TransactionSigner,
    payer: TransactionSigner,
    amountToDepositLamports?: BN,
  ): Promise<{
    createIxs: Instruction[];
    fillIxs: Instruction[];
    closeIx: Instruction[];
    ata: Address;
  }> {
    const createIxs: Instruction[] = [];
    const { ata, createAtaIx } = await createAtaIdempotent(
      owner.address,
      payer,
      WRAPPED_SOL_MINT,
    );
    createIxs.push(createAtaIx);
    const fillIxs: Instruction[] = [];
    if (amountToDepositLamports && payer === owner) {
      fillIxs.push(
        ...this.getDepositWsolIxns(owner, ata, amountToDepositLamports),
      );
    }
    const closeWsolAtaIxn: Instruction[] = [];
    if (payer === owner) {
      closeWsolAtaIxn.push(
        getCloseAccountInstruction({
          account: ata,
          destination: owner.address,
          owner: owner,
        }),
      );
    }

    return {
      createIxs: createIxs,
      fillIxs: fillIxs,
      closeIx: closeWsolAtaIxn,
      ata,
    };
  }

  /**
   * Get the deposit WSOL instructions
   * @param owner - the owner address
   * @param ata - the ata address
   * @param amountLamports - the amount in lamports
   * @returns the transaction instructions
   */
  getDepositWsolIxns(
    owner: TransactionSigner,
    ata: Address,
    amountLamports: BN,
  ): Instruction[] {
    const ixns: Instruction[] = [];

    // Transfer to WSOL ata
    ixns.push(
      getTransferSolInstruction({
        source: owner,
        destination: ata,
        amount: BigInt(amountLamports.toString()),
      }),
    );

    // Sync wrapped SOL
    ixns.push({
      accounts: [
        {
          address: ata,
          role: AccountRole.WRITABLE,
        },
      ],
      data: new Uint8Array([17]),
      programAddress: TOKEN_PROGRAM_ADDRESS,
    } satisfies Instruction);

    return ixns;
  }
}
