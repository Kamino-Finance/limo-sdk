import * as Instructions from "../rpc_client/instructions";
import { UpdateOrderArgs } from "../rpc_client/instructions";
import {
  asOption,
  getAssociatedTokenAddress,
  getEventAuthorityPDA,
  getExpressRelayConfigRouterPDA,
  getExpressRelayMetadataPDA,
  getPdaAuthority,
  getTokenVaultPDA,
} from "./utils";
import {
  UpdateGlobalConfigMode,
  UpdateGlobalConfigModeKind,
  UpdateOrderMode,
  UpdateOrderModeKind,
} from "../rpc_client/types/index";
import { GlobalConfig } from "../rpc_client/accounts";
import {
  Address,
  getAddressEncoder,
  Instruction,
  TransactionSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  SYSVAR_INSTRUCTIONS_ADDRESS,
  SYSVAR_RENT_ADDRESS,
} from "@solana/sysvars";
import BN from "bn.js";

export interface OrderParams {
  quoteTokenMint: Address;
  baseTokenMint: Address;
  quoteTokenAmount: BN;
  baseTokenAmount: BN;
  side: "bid" | "ask";
}

export function initializeGlobalConfig(
  adminAuthority: TransactionSigner,
  globalConfig: Address,
  pdaAuthority: Address,
  programId: Address,
): Instruction {
  let accounts: Instructions.InitializeGlobalConfigAccounts = {
    adminAuthority,
    pdaAuthority,
    globalConfig,
  };

  let ix = Instructions.initializeGlobalConfig(accounts, [], programId);

  return ix;
}

export async function initializeVault(
  owner: TransactionSigner,
  globalConfig: Address,
  mint: Address,
  programAddress: Address,
  mintProgramId: Address,
): Promise<Instruction> {
  let vault = await getTokenVaultPDA(programAddress, globalConfig, mint);
  let pdaAuthority = await getPdaAuthority(programAddress, globalConfig);
  let accounts: Instructions.InitializeVaultAccounts = {
    payer: owner,
    globalConfig,
    pdaAuthority,
    mint,
    vault,
    tokenProgram: mintProgramId,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
  };

  let ix = Instructions.initializeVault(accounts, [], programAddress);

  return ix;
}

export async function createOrder(
  maker: TransactionSigner,
  globalConfig: Address,
  order: Address,
  orderParams: OrderParams,
  programAddress: Address,
  baseTokenMintProgramId: Address,
  quoteTokenMintProgramId: Address,
): Promise<Instruction> {
  let quoteTokenVault = await getTokenVaultPDA(
    programAddress,
    globalConfig,
    orderParams.quoteTokenMint,
  );
  let baseTokenVault = await getTokenVaultPDA(
    programAddress,
    globalConfig,
    orderParams.baseTokenMint,
  );

  let pdaAuthority = await getPdaAuthority(programAddress, globalConfig);
  let accounts: Instructions.CreateOrderAccounts = {
    maker,
    globalConfig,
    pdaAuthority,
    order,
    inputMint:
      orderParams.side === "bid"
        ? orderParams.baseTokenMint
        : orderParams.quoteTokenMint,
    outputMint:
      orderParams.side === "bid"
        ? orderParams.quoteTokenMint
        : orderParams.baseTokenMint,
    makerAta:
      orderParams.side === "bid"
        ? await getAssociatedTokenAddress(
            maker.address,
            orderParams.baseTokenMint,
            baseTokenMintProgramId,
          )
        : await getAssociatedTokenAddress(
            maker.address,
            orderParams.quoteTokenMint,
            quoteTokenMintProgramId,
          ),
    inputVault: orderParams.side === "bid" ? baseTokenVault : quoteTokenVault,
    inputTokenProgram:
      orderParams.side === "bid"
        ? baseTokenMintProgramId
        : quoteTokenMintProgramId,
    outputTokenProgram:
      orderParams.side === "bid"
        ? quoteTokenMintProgramId
        : baseTokenMintProgramId,
    eventAuthority: await getEventAuthorityPDA(programAddress),
    program: programAddress,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
  };

  let args: Instructions.CreateOrderArgs = {
    inputAmount: new BN(
      orderParams.side === "bid"
        ? orderParams.baseTokenAmount
        : orderParams.quoteTokenAmount,
    ),
    outputAmount: new BN(
      orderParams.side === "bid"
        ? orderParams.quoteTokenAmount
        : orderParams.baseTokenAmount,
    ),
    orderType: orderParams.side === "bid" ? 0 : 1,
  };
  let ix = Instructions.createOrder(args, accounts, [], programAddress);

  return ix;
}

export function updateOrder(
  mode: UpdateOrderModeKind,
  value: boolean | Address,
  maker: TransactionSigner,
  globalConfig: Address,
  order: Address,
  programAddress: Address,
): Instruction {
  let args: UpdateOrderArgs = {
    mode: mode.discriminator,
    value: encodedUpdateOrderValue(mode, value),
  };
  let accounts: Instructions.UpdateOrderAccounts = {
    maker,
    globalConfig,
    order,
  };

  let ix = Instructions.updateOrder(args, accounts, [], programAddress);

  return ix;
}

export async function takeOrder(params: {
  taker: TransactionSigner;
  maker: Address;
  globalConfig: Address;
  inputMint: Address;
  outputMint: Address;
  order: Address;
  inputAmountLamports: BN;
  minOutputAmountLamports: BN;
  programAddress: Address;
  expressRelayProgramId: Address;
  takerInputAta: Address;
  takerOutputAta: Address;
  intermediaryOutputTokenAccount?: Address;
  makerOutputAta?: Address;
  inputTokenProgram: Address;
  outputTokenProgram: Address;
  permissionlessTipLamports: BN;
  permissionless: boolean;
}): Promise<Instruction> {
  let pdaAuthority = await getPdaAuthority(
    params.programAddress,
    params.globalConfig,
  );
  let inputVault = await getTokenVaultPDA(
    params.programAddress,
    params.globalConfig,
    params.inputMint,
  );

  let accounts: Instructions.TakeOrderAccounts = {
    taker: params.taker,
    maker: params.maker,
    globalConfig: params.globalConfig,
    pdaAuthority,
    order: params.order,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    inputVault,
    expressRelay: params.expressRelayProgramId,
    expressRelayMetadata: await getExpressRelayMetadataPDA(
      params.expressRelayProgramId,
    ),
    permission: asOption(params.permissionless ? undefined : params.order),
    configRouter: await getExpressRelayConfigRouterPDA(
      params.expressRelayProgramId,
      pdaAuthority,
    ),
    sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
    takerInputAta: params.takerInputAta,
    intermediaryOutputTokenAccount: asOption(
      params.intermediaryOutputTokenAccount,
    ),
    takerOutputAta: params.takerOutputAta,
    makerOutputAta: asOption(params.makerOutputAta),
    inputTokenProgram: params.inputTokenProgram,
    outputTokenProgram: params.outputTokenProgram,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    rent: SYSVAR_RENT_ADDRESS,
    eventAuthority: await getEventAuthorityPDA(params.programAddress),
    program: params.programAddress,
  };

  let args: Instructions.TakeOrderArgs = {
    inputAmount: params.inputAmountLamports,
    minOutputAmount: params.minOutputAmountLamports,
    tipAmountPermissionlessTaking: params.permissionlessTipLamports,
  };
  let ix = Instructions.takeOrder(args, accounts, [], params.programAddress);

  return ix;
}

export async function flashTakeOrder(params: {
  taker: TransactionSigner;
  maker: Address;
  globalConfig: Address;
  inputMint: Address;
  outputMint: Address;
  order: Address;
  inputAmountLamports: BN;
  minOutputAmountLamports: BN;
  programAddress: Address;
  expressRelayProgramId: Address;
  takerInputAta: Address;
  takerOutputAta: Address;
  intermediaryOutputTokenAccount: Address | undefined;
  makerOutputAta: Address | undefined;
  inputTokenProgram: Address;
  outputTokenProgram: Address;
  permissionlessTipLamports: BN | undefined;
  permissionless: boolean;
}): Promise<{ startIx: Instruction; endIx: Instruction }> {
  let pdaAuthority = await getPdaAuthority(
    params.programAddress,
    params.globalConfig,
  );
  let inputVault = await getTokenVaultPDA(
    params.programAddress,
    params.globalConfig,
    params.inputMint,
  );

  let startAccounts: Instructions.FlashTakeOrderStartAccounts = {
    taker: params.taker,
    maker: params.maker,
    globalConfig: params.globalConfig,
    pdaAuthority,
    order: params.order,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    inputVault,
    expressRelay: params.expressRelayProgramId,
    expressRelayMetadata: await getExpressRelayMetadataPDA(
      params.expressRelayProgramId,
    ),
    permission: asOption(params.permissionless ? undefined : params.order),
    configRouter: await getExpressRelayConfigRouterPDA(
      params.expressRelayProgramId,
      pdaAuthority,
    ),
    sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
    takerInputAta: params.takerInputAta,
    takerOutputAta: params.takerOutputAta,
    intermediaryOutputTokenAccount: asOption(
      params.intermediaryOutputTokenAccount,
    ),
    makerOutputAta: asOption(params.makerOutputAta),
    inputTokenProgram: params.inputTokenProgram,
    outputTokenProgram: params.outputTokenProgram,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    rent: SYSVAR_RENT_ADDRESS,
    eventAuthority: await getEventAuthorityPDA(params.programAddress),
    program: params.programAddress,
  };

  let startArgs: Instructions.FlashTakeOrderStartArgs = {
    inputAmount: new BN(params.inputAmountLamports),
    minOutputAmount: new BN(params.minOutputAmountLamports),
    tipAmountPermissionlessTaking:
      params.permissionlessTipLamports ?? new BN(0),
  };
  let startIx = Instructions.flashTakeOrderStart(
    startArgs,
    startAccounts,
    [],
    params.programAddress,
  );

  let endAccounts: Instructions.FlashTakeOrderEndAccounts = {
    taker: params.taker,
    maker: params.maker,
    globalConfig: params.globalConfig,
    pdaAuthority,
    order: params.order,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    inputVault,
    expressRelay: params.expressRelayProgramId,
    expressRelayMetadata: await getExpressRelayMetadataPDA(
      params.expressRelayProgramId,
    ),
    permission: asOption(params.permissionless ? undefined : params.order),
    configRouter: await getExpressRelayConfigRouterPDA(
      params.expressRelayProgramId,
      pdaAuthority,
    ),
    sysvarInstructions: SYSVAR_INSTRUCTIONS_ADDRESS,
    takerInputAta: params.takerInputAta,
    takerOutputAta: params.takerOutputAta,
    intermediaryOutputTokenAccount: asOption(
      params.intermediaryOutputTokenAccount,
    ),
    makerOutputAta: asOption(params.makerOutputAta),
    inputTokenProgram: params.inputTokenProgram,
    outputTokenProgram: params.outputTokenProgram,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    rent: SYSVAR_RENT_ADDRESS,
    eventAuthority: await getEventAuthorityPDA(params.programAddress),
    program: params.programAddress,
  };

  let endArgs: Instructions.FlashTakeOrderEndArgs = {
    inputAmount: new BN(params.inputAmountLamports),
    minOutputAmount: new BN(params.minOutputAmountLamports),
    tipAmountPermissionlessTaking:
      params.permissionlessTipLamports ?? new BN(0),
  };
  let endIx = Instructions.flashTakeOrderEnd(
    endArgs,
    endAccounts,
    [],
    params.programAddress,
  );

  return {
    startIx,
    endIx,
  };
}

export async function closeOrderAndClaimTip(params: {
  maker: TransactionSigner;
  globalConfig: Address;
  inputMint: Address;
  outputMint: Address;
  order: Address;
  programAddress: Address;
  makerInputAta: Address;
  inputTokenProgram: Address;
}): Promise<Instruction> {
  let pdaAuthority = await getPdaAuthority(
    params.programAddress,
    params.globalConfig,
  );
  let inputVault = await getTokenVaultPDA(
    params.programAddress,
    params.globalConfig,
    params.inputMint,
  );

  let accounts: Instructions.CloseOrderAndClaimTipAccounts = {
    maker: params.maker,
    order: params.order,
    globalConfig: params.globalConfig,
    pdaAuthority,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    makerInputAta: params.makerInputAta,
    inputVault,
    inputTokenProgram: params.inputTokenProgram,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    eventAuthority: await getEventAuthorityPDA(params.programAddress),
    program: params.programAddress,
  };

  let ix = Instructions.closeOrderAndClaimTip(
    accounts,
    [],
    params.programAddress,
  );

  return ix;
}

export async function withdrawHostTipIx(params: {
  admin: TransactionSigner;
  globalConfig: Address;
  programAddress: Address;
}): Promise<Instruction> {
  let pdaAuthority = await getPdaAuthority(
    params.programAddress,
    params.globalConfig,
  );

  let accounts: Instructions.WithdrawHostTipAccounts = {
    adminAuthority: params.admin,
    globalConfig: params.globalConfig,
    pdaAuthority,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
  };

  let ix = Instructions.withdrawHostTip(accounts, [], params.programAddress);

  return ix;
}

export function updateGlobalConfigIx(
  admin: TransactionSigner,
  globalConfig: Address,
  mode: UpdateGlobalConfigModeKind,
  value: number | Address,
  programAddress: Address,
): Instruction {
  let accounts: Instructions.UpdateGlobalConfigAccounts = {
    adminAuthority: admin,
    globalConfig,
  };

  let args: Instructions.UpdateGlobalConfigArgs = {
    mode: mode.discriminator,
    value: encodedUpdateGlobalConfigValue(mode, value),
  };

  let ix = Instructions.updateGlobalConfig(args, accounts, [], programAddress);

  return ix;
}

export function updateGlobalConfigAdminIx(
  admin: TransactionSigner,
  globalConfigAddress: Address,
  globalConfig: GlobalConfig,
  programAddress: Address,
): Instruction {
  let accounts: Instructions.UpdateGlobalConfigAdminAccounts = {
    // TODO do we really need a cached admin authority? If yes, we need to cache the keypair not just the address
    //adminAuthorityCached: createNoopSigner(globalConfig.adminAuthorityCached),
    adminAuthorityCached: admin,
    globalConfig: globalConfigAddress,
  };

  let ix = Instructions.updateGlobalConfigAdmin(accounts, [], programAddress);

  return ix;
}

function encodedUpdateOrderValue(
  mode: UpdateOrderModeKind,
  value: boolean | Address,
): Uint8Array {
  let valueBoolean: number;
  let valuePublicKey: Buffer;
  let valueData: Buffer;
  switch (mode.discriminator) {
    case UpdateOrderMode.UpdatePermissionless.discriminator:
      valueBoolean = (value as boolean) ? 1 : 0;
      valueData = Buffer.alloc(1);
      valueData.writeUIntLE(valueBoolean, 0, 1);
      break;
    case UpdateOrderMode.UpdateCounterparty.discriminator:
      valuePublicKey = Buffer.from(
        getAddressEncoder().encode(value as Address),
      );
      valueData = Buffer.alloc(32);
      valuePublicKey.copy(valueData, 0);
      break;
  }

  const uint8Array = new Uint8Array(valueData);
  return uint8Array;
}

function encodedUpdateGlobalConfigValue(
  mode: UpdateGlobalConfigModeKind,
  value: number | Address,
): Array<number> {
  const valueData = Buffer.alloc(128);
  let valueNumber: number;
  let valueAddress: Buffer;
  switch (mode.discriminator) {
    case UpdateGlobalConfigMode.UpdateEmergencyMode.discriminator:
    case UpdateGlobalConfigMode.UpdateFlashTakeOrderBlocked.discriminator:
    case UpdateGlobalConfigMode.UpdateBlockNewOrders.discriminator:
    case UpdateGlobalConfigMode.UpdateBlockOrderTaking.discriminator:
    case UpdateGlobalConfigMode.UpdateOrderTakingPermissionless.discriminator:
      valueNumber = value as number;
      valueData.writeUIntLE(valueNumber, 0, 1);
      break;
    case UpdateGlobalConfigMode.UpdateHostFeeBps.discriminator:
      valueNumber = value as number;
      valueData.writeUInt16LE(valueNumber, 0);
      break;
    case UpdateGlobalConfigMode.UpdateOrderCloseDelaySeconds.discriminator:
    case UpdateGlobalConfigMode.UpdateAtaCreationCost.discriminator:
    case UpdateGlobalConfigMode.UpdateTxnFeeCost.discriminator:
    case UpdateGlobalConfigMode.UpdateOrderCloseDelaySeconds.discriminator:
      valueNumber = value as number;
      valueData.writeBigUInt64LE(BigInt(value.toString()), 0);
      break;
    case UpdateGlobalConfigMode.UpdateAdminAuthorityCached.discriminator:
      valueAddress = Buffer.from(getAddressEncoder().encode(value as Address));
      valueAddress.copy(valueData, 0);
      break;
  }

  const uint8Array = new Uint8Array(valueData);
  return Array.from(uint8Array);
}
