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

export const DISCRIMINATOR = Buffer.from([48, 191, 163, 44, 71, 129, 63, 164]);

export interface InitializeVaultAccounts {
  payer: TransactionSigner;
  globalConfig: Address;
  pdaAuthority: Address;
  mint: Address;
  vault: Address;
  tokenProgram: Address;
  systemProgram: Address;
}

export function initializeVault(
  accounts: InitializeVaultAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.payer.address, role: 3, signer: accounts.payer },
    { address: accounts.globalConfig, role: 1 },
    { address: accounts.pdaAuthority, role: 0 },
    { address: accounts.mint, role: 0 },
    { address: accounts.vault, role: 1 },
    { address: accounts.tokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    ...remainingAccounts,
  ];
  const data = DISCRIMINATOR;
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
