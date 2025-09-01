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

export const DISCRIMINATOR = Buffer.from([140, 246, 105, 165, 80, 85, 143, 18]);

export interface WithdrawHostTipAccounts {
  adminAuthority: TransactionSigner;
  globalConfig: Address;
  pdaAuthority: Address;
  systemProgram: Address;
}

export function withdrawHostTip(
  accounts: WithdrawHostTipAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.adminAuthority.address,
      role: 3,
      signer: accounts.adminAuthority,
    },
    { address: accounts.globalConfig, role: 1 },
    { address: accounts.pdaAuthority, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    ...remainingAccounts,
  ];
  const data = DISCRIMINATOR;
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
