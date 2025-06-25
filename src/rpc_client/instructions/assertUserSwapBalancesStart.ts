import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface AssertUserSwapBalancesStartAccounts {
  maker: PublicKey;
  inputTa: PublicKey;
  outputTa: PublicKey;
  userSwapBalanceState: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
  sysvarInstructions: PublicKey;
}

export function assertUserSwapBalancesStart(
  accounts: AssertUserSwapBalancesStartAccounts,
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
  const identifier = Buffer.from([95, 241, 226, 193, 214, 175, 142, 139]);
  const data = identifier;
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
