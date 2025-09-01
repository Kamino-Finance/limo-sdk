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

export const DISCRIMINATOR = Buffer.from([244, 27, 12, 226, 45, 247, 230, 43]);

export interface CloseOrderAndClaimTipAccounts {
  maker: TransactionSigner;
  order: Address;
  globalConfig: Address;
  pdaAuthority: Address;
  inputMint: Address;
  /** - required only for indexing the order state from the instruction */
  outputMint: Address;
  makerInputAta: Address;
  inputVault: Address;
  inputTokenProgram: Address;
  systemProgram: Address;
  eventAuthority: Address;
  program: Address;
}

export function closeOrderAndClaimTip(
  accounts: CloseOrderAndClaimTipAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.maker.address, role: 3, signer: accounts.maker },
    { address: accounts.order, role: 1 },
    { address: accounts.globalConfig, role: 1 },
    { address: accounts.pdaAuthority, role: 1 },
    { address: accounts.inputMint, role: 0 },
    { address: accounts.outputMint, role: 0 },
    { address: accounts.makerInputAta, role: 1 },
    { address: accounts.inputVault, role: 1 },
    { address: accounts.inputTokenProgram, role: 0 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ];
  const data = DISCRIMINATOR;
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
