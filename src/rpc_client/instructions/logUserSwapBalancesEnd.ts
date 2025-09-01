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

export const DISCRIMINATOR = Buffer.from([140, 42, 198, 82, 147, 144, 44, 113]);

export interface LogUserSwapBalancesEndArgs {
  simulatedSwapAmountOut: BN;
  simulatedTs: BN;
  minimumAmountOut: BN;
  swapAmountIn: BN;
  simulatedAmountOutNextBest: BN;
  aggregator: number;
  nextBestAggregator: number;
  padding: Array<number>;
}

export interface LogUserSwapBalancesEndAccounts {
  baseAccounts: {
    maker: TransactionSigner;
    inputMint: Address;
    outputMint: Address;
    inputTa: Address;
    outputTa: Address;
    /** if it's not the pda it doesn't matter */
    pdaReferrer: Option<Address>;
    swapProgramId: Address;
  };
  userSwapBalanceState: Address;
  systemProgram: Address;
  rent: Address;
  sysvarInstructions: Address;
  eventAuthority: Address;
  program: Address;
}

export const layout = borsh.struct<LogUserSwapBalancesEndArgs>([
  borsh.u64("simulatedSwapAmountOut"),
  borsh.u64("simulatedTs"),
  borsh.u64("minimumAmountOut"),
  borsh.u64("swapAmountIn"),
  borsh.u64("simulatedAmountOutNextBest"),
  borsh.u8("aggregator"),
  borsh.u8("nextBestAggregator"),
  borsh.array(borsh.u8(), 2, "padding"),
]);

export function logUserSwapBalancesEnd(
  args: LogUserSwapBalancesEndArgs,
  accounts: LogUserSwapBalancesEndAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    {
      address: accounts.baseAccounts.maker.address,
      role: 2,
      signer: accounts.baseAccounts.maker,
    },
    { address: accounts.baseAccounts.inputMint, role: 0 },
    { address: accounts.baseAccounts.outputMint, role: 0 },
    { address: accounts.baseAccounts.inputTa, role: 0 },
    { address: accounts.baseAccounts.outputTa, role: 0 },
    isSome(accounts.baseAccounts.pdaReferrer)
      ? { address: accounts.baseAccounts.pdaReferrer.value, role: 0 }
      : { address: programAddress, role: 0 },
    { address: accounts.baseAccounts.swapProgramId, role: 0 },
    { address: accounts.userSwapBalanceState, role: 1 },
    { address: accounts.systemProgram, role: 0 },
    { address: accounts.rent, role: 0 },
    { address: accounts.sysvarInstructions, role: 0 },
    { address: accounts.eventAuthority, role: 0 },
    { address: accounts.program, role: 0 },
    ...remainingAccounts,
  ];
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      simulatedSwapAmountOut: args.simulatedSwapAmountOut,
      simulatedTs: args.simulatedTs,
      minimumAmountOut: args.minimumAmountOut,
      swapAmountIn: args.swapAmountIn,
      simulatedAmountOutNextBest: args.simulatedAmountOutNextBest,
      aggregator: args.aggregator,
      nextBestAggregator: args.nextBestAggregator,
      padding: args.padding,
    },
    buffer,
  );
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len);
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
