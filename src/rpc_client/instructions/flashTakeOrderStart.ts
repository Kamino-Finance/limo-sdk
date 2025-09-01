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

export const DISCRIMINATOR = Buffer.from([126, 53, 176, 15, 39, 103, 97, 243]);

export interface FlashTakeOrderStartArgs {
  inputAmount: BN;
  minOutputAmount: BN;
  tipAmountPermissionlessTaking: BN;
}

export interface FlashTakeOrderStartAccounts {
  taker: TransactionSigner;
  maker: Address;
  globalConfig: Address;
  pdaAuthority: Address;
  order: Address;
  inputMint: Address;
  outputMint: Address;
  inputVault: Address;
  takerInputAta: Address;
  takerOutputAta: Address;
  intermediaryOutputTokenAccount: Option<Address>;
  makerOutputAta: Option<Address>;
  expressRelay: Address;
  expressRelayMetadata: Address;
  sysvarInstructions: Address;
  permission: Option<Address>;
  configRouter: Address;
  inputTokenProgram: Address;
  outputTokenProgram: Address;
  systemProgram: Address;
  rent: Address;
  eventAuthority: Address;
  program: Address;
}

export const layout = borsh.struct<FlashTakeOrderStartArgs>([
  borsh.u64("inputAmount"),
  borsh.u64("minOutputAmount"),
  borsh.u64("tipAmountPermissionlessTaking"),
]);

export function flashTakeOrderStart(
  args: FlashTakeOrderStartArgs,
  accounts: FlashTakeOrderStartAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.taker.address, role: 3, signer: accounts.taker },
    { address: accounts.maker, role: 1 },
    { address: accounts.globalConfig, role: 1 },
    { address: accounts.pdaAuthority, role: 1 },
    { address: accounts.order, role: 1 },
    { address: accounts.inputMint, role: 0 },
    { address: accounts.outputMint, role: 0 },
    { address: accounts.inputVault, role: 1 },
    { address: accounts.takerInputAta, role: 1 },
    { address: accounts.takerOutputAta, role: 1 },
    isSome(accounts.intermediaryOutputTokenAccount)
      ? { address: accounts.intermediaryOutputTokenAccount.value, role: 1 }
      : { address: programAddress, role: 0 },
    isSome(accounts.makerOutputAta)
      ? { address: accounts.makerOutputAta.value, role: 1 }
      : { address: programAddress, role: 0 },
    { address: accounts.expressRelay, role: 0 },
    { address: accounts.expressRelayMetadata, role: 0 },
    { address: accounts.sysvarInstructions, role: 0 },
    isSome(accounts.permission)
      ? { address: accounts.permission.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.configRouter, role: 0 },
    { address: accounts.inputTokenProgram, role: 0 },
    { address: accounts.outputTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ];
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      inputAmount: args.inputAmount,
      minOutputAmount: args.minOutputAmount,
      tipAmountPermissionlessTaking: args.tipAmountPermissionlessTaking,
    },
    buffer,
  );
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len);
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
