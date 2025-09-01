/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Address,
  isSome,
  AccountMeta,
  AccountSignerMeta,
  Instruction,
  Option,
  TransactionSigner,
} from "@solana/kit";
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export const DISCRIMINATOR = Buffer.from([
  141, 54, 37, 207, 237, 210, 250, 215,
]);

export interface CreateOrderArgs {
  inputAmount: BN;
  outputAmount: BN;
  orderType: number;
}

export interface CreateOrderAccounts {
  maker: TransactionSigner;
  globalConfig: Address;
  pdaAuthority: Address;
  order: Address;
  inputMint: Address;
  outputMint: Address;
  makerAta: Address;
  inputVault: Address;
  inputTokenProgram: Address;
  outputTokenProgram: Address;
  systemProgram: Address;
  eventAuthority: Address;
  program: Address;
}

export const layout = borsh.struct<CreateOrderArgs>([
  borsh.u64("inputAmount"),
  borsh.u64("outputAmount"),
  borsh.u8("orderType"),
]);

export function createOrder(
  args: CreateOrderArgs,
  accounts: CreateOrderAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.maker.address, role: 3, signer: accounts.maker },
    { address: accounts.globalConfig, role: 1 },
    { address: accounts.pdaAuthority, role: 0 },
    { address: accounts.order, role: 1 },
    { address: accounts.inputMint, role: 0 },
    { address: accounts.outputMint, role: 0 },
    { address: accounts.makerAta, role: 1 },
    { address: accounts.inputVault, role: 1 },
    { address: accounts.inputTokenProgram, role: 0 },
    { address: accounts.outputTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ];
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      inputAmount: args.inputAmount,
      outputAmount: args.outputAmount,
      orderType: args.orderType,
    },
    buffer,
  );
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len);
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
