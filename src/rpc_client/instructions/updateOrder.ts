import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface UpdateOrderArgs {
  mode: types.UpdateOrderModeKind;
  value: Uint8Array;
}

export interface UpdateOrderAccounts {
  maker: PublicKey;
  globalConfig: PublicKey;
  order: PublicKey;
}

export const layout = borsh.struct([
  types.UpdateOrderMode.layout("mode"),
  borsh.vecU8("value"),
]);

export function updateOrder(
  args: UpdateOrderArgs,
  accounts: UpdateOrderAccounts,
  programId: PublicKey = PROGRAM_ID,
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.maker, isSigner: true, isWritable: false },
    { pubkey: accounts.globalConfig, isSigner: false, isWritable: false },
    { pubkey: accounts.order, isSigner: false, isWritable: true },
  ];
  const identifier = Buffer.from([54, 8, 208, 207, 34, 134, 239, 168]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      mode: args.mode.toEncodable(),
      value: Buffer.from(
        args.value.buffer,
        args.value.byteOffset,
        args.value.length,
      ),
    },
    buffer,
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
