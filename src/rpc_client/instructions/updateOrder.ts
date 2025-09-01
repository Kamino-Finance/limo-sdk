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

export const DISCRIMINATOR = Buffer.from([54, 8, 208, 207, 34, 134, 239, 168]);

export interface UpdateOrderArgs {
  mode: number;
  value: Uint8Array;
}

export interface UpdateOrderAccounts {
  maker: TransactionSigner;
  globalConfig: Address;
  order: Address;
}

export const layout = borsh.struct<UpdateOrderArgs>([
  borsh.u16("mode"),
  borsh.vecU8("value"),
]);

export function updateOrder(
  args: UpdateOrderArgs,
  accounts: UpdateOrderAccounts,
  remainingAccounts: Array<AccountMeta | AccountSignerMeta> = [],
  programAddress: Address = PROGRAM_ID,
) {
  const keys: Array<AccountMeta | AccountSignerMeta> = [
    { address: accounts.maker.address, role: 2, signer: accounts.maker },
    { address: accounts.globalConfig, role: 0 },
    { address: accounts.order, role: 1 },
    ...remainingAccounts,
  ];
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      mode: args.mode,
      value: Buffer.from(
        args.value.buffer,
        args.value.byteOffset,
        args.value.length,
      ),
    },
    buffer,
  );
  const data = Buffer.concat([DISCRIMINATOR, buffer]).slice(0, 8 + len);
  const ix: Instruction = { accounts: keys, programAddress, data };
  return ix;
}
