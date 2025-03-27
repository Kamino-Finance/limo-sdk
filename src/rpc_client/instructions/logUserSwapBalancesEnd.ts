import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface LogUserSwapBalancesEndAccounts {
  baseAccounts: {
    maker: PublicKey;
    inputMint: PublicKey;
    outputMint: PublicKey;
    inputTa: PublicKey;
    outputTa: PublicKey;
    /** if it's not the pda it doesn't matter */
    pdaReferrer: PublicKey;
    swapProgramId: PublicKey;
  };
  userSwapBalanceState: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
  sysvarInstructions: PublicKey;
  eventAuthority: PublicKey;
  program: PublicKey;
}

export function logUserSwapBalancesEnd(
  accounts: LogUserSwapBalancesEndAccounts,
  programId: PublicKey = PROGRAM_ID,
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.baseAccounts.maker, isSigner: true, isWritable: false },
    {
      pubkey: accounts.baseAccounts.inputMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.baseAccounts.outputMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.baseAccounts.inputTa,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.baseAccounts.outputTa,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.baseAccounts.pdaReferrer,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.baseAccounts.swapProgramId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: accounts.userSwapBalanceState,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.rent, isSigner: false, isWritable: false },
    { pubkey: accounts.sysvarInstructions, isSigner: false, isWritable: false },
    { pubkey: accounts.eventAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.program, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([140, 42, 198, 82, 147, 144, 44, 113]);
  const data = identifier;
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
