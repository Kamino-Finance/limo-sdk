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
  113, 216, 122, 131, 225, 209, 22, 55,
]);

export interface InitializeGlobalConfigAccounts {
  adminAuthority: TransactionSigner;
  pdaAuthority: Address;
  globalConfig: Address;
}

export function initializeGlobalConfig(
  accounts: InitializeGlobalConfigAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.adminAuthority.address,
      role: 3,
      signer: accounts.adminAuthority,
    },
    { address: accounts.pdaAuthority, role: 1 },
    { address: accounts.globalConfig, role: 1 },
    ...remainingAccounts,
  ];
  const data = DISCRIMINATOR;
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
