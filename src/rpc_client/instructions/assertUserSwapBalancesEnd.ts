import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface AssertUserSwapBalancesEndArgs {
  maxInputAmountChange: BN;
  minOutputAmountChange: BN;
}

export interface AssertUserSwapBalancesEndAccounts {
  maker: PublicKey;
  inputTa: PublicKey;
  outputTa: PublicKey;
  userSwapBalanceState: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
  sysvarInstructions: PublicKey;
}

export const layout = borsh.struct([
  borsh.u64("maxInputAmountChange"),
  borsh.u64("minOutputAmountChange"),
]);

export function assertUserSwapBalancesEnd(
  args: AssertUserSwapBalancesEndArgs,
  accounts: AssertUserSwapBalancesEndAccounts,
  programId: PublicKey = PROGRAM_ID,
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.maker, isSigner: true, isWritable: true },
    { pubkey: accounts.inputTa, isSigner: false, isWritable: false },
    { pubkey: accounts.outputTa, isSigner: false, isWritable: false },
    {
      pubkey: accounts.userSwapBalanceState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.sysvarInstructions, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([163, 157, 174, 93, 28, 127, 250, 136]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      maxInputAmountChange: args.maxInputAmountChange,
      minOutputAmountChange: args.minOutputAmountChange,
    },
    buffer,
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
