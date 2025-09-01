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
  163, 157, 174, 93, 28, 127, 250, 136,
]);

export interface AssertUserSwapBalancesEndArgs {
  maxInputAmountChange: BN;
  minOutputAmountChange: BN;
}

export interface AssertUserSwapBalancesEndAccounts {
  maker: TransactionSigner;
  inputTa: Address;
  outputTa: Address;
  userSwapBalanceState: Address;
  systemProgram: Address;
  rent: Address;
  sysvarInstructions: Address;
}

export const layout = borsh.struct<AssertUserSwapBalancesEndArgs>([
  borsh.u64("maxInputAmountChange"),
  borsh.u64("minOutputAmountChange"),
]);

export function assertUserSwapBalancesEnd(
  args: AssertUserSwapBalancesEndArgs,
  accounts: AssertUserSwapBalancesEndAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.maker.address, role: 3, signer: accounts.maker },
    { address: accounts.inputTa, role: 0 },
    { address: accounts.outputTa, role: 0 },
    { address: accounts.userSwapBalanceState, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.sysvarInstructions, role: 0 },
    ...remainingAccounts,
  ];
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      maxInputAmountChange: args.maxInputAmountChange,
      minOutputAmountChange: args.minOutputAmountChange,
    },
    buffer,
  );
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len);
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
