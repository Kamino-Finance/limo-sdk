/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  address,
  Address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit";
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface GlobalConfigFields {
  emergencyMode: number;
  flashTakeOrderBlocked: number;
  newOrdersBlocked: number;
  ordersTakingBlocked: number;
  hostFeeBps: number;
  padding0: Array<number>;
  /** The number of seconds after an order has been updated before it can be closed */
  orderCloseDelaySeconds: BN;
  padding1: Array<BN>;
  /**
   * The total amount of lamports that were present in the pda_authority last
   * time a program instructions which alters the pda_authority account was
   * executed
   */
  pdaAuthorityPreviousLamportsBalance: BN;
  /**
   * The total amount of tips that have been paid out - should be at least
   * as much as the total lamports present in the pda_authority account
   */
  totalTipAmount: BN;
  /**
   * The amount of tips the host is due to receive -
   * in lamports, stored in the pda_authority account
   */
  hostTipAmount: BN;
  pdaAuthority: Address;
  pdaAuthorityBump: BN;
  adminAuthority: Address;
  adminAuthorityCached: Address;
  txnFeeCost: BN;
  ataCreationCost: BN;
  padding2: Array<BN>;
}

export interface GlobalConfigJSON {
  emergencyMode: number;
  flashTakeOrderBlocked: number;
  newOrdersBlocked: number;
  ordersTakingBlocked: number;
  hostFeeBps: number;
  padding0: Array<number>;
  /** The number of seconds after an order has been updated before it can be closed */
  orderCloseDelaySeconds: string;
  padding1: Array<string>;
  /**
   * The total amount of lamports that were present in the pda_authority last
   * time a program instructions which alters the pda_authority account was
   * executed
   */
  pdaAuthorityPreviousLamportsBalance: string;
  /**
   * The total amount of tips that have been paid out - should be at least
   * as much as the total lamports present in the pda_authority account
   */
  totalTipAmount: string;
  /**
   * The amount of tips the host is due to receive -
   * in lamports, stored in the pda_authority account
   */
  hostTipAmount: string;
  pdaAuthority: string;
  pdaAuthorityBump: string;
  adminAuthority: string;
  adminAuthorityCached: string;
  txnFeeCost: string;
  ataCreationCost: string;
  padding2: Array<string>;
}

export class GlobalConfig {
  readonly emergencyMode: number;
  readonly flashTakeOrderBlocked: number;
  readonly newOrdersBlocked: number;
  readonly ordersTakingBlocked: number;
  readonly hostFeeBps: number;
  readonly padding0: Array<number>;
  /** The number of seconds after an order has been updated before it can be closed */
  readonly orderCloseDelaySeconds: BN;
  readonly padding1: Array<BN>;
  /**
   * The total amount of lamports that were present in the pda_authority last
   * time a program instructions which alters the pda_authority account was
   * executed
   */
  readonly pdaAuthorityPreviousLamportsBalance: BN;
  /**
   * The total amount of tips that have been paid out - should be at least
   * as much as the total lamports present in the pda_authority account
   */
  readonly totalTipAmount: BN;
  /**
   * The amount of tips the host is due to receive -
   * in lamports, stored in the pda_authority account
   */
  readonly hostTipAmount: BN;
  readonly pdaAuthority: Address;
  readonly pdaAuthorityBump: BN;
  readonly adminAuthority: Address;
  readonly adminAuthorityCached: Address;
  readonly txnFeeCost: BN;
  readonly ataCreationCost: BN;
  readonly padding2: Array<BN>;

  static readonly discriminator = Buffer.from([
    149, 8, 156, 202, 160, 252, 176, 217,
  ]);

  static readonly layout = borsh.struct<GlobalConfig>([
    borsh.u8("emergencyMode"),
    borsh.u8("flashTakeOrderBlocked"),
    borsh.u8("newOrdersBlocked"),
    borsh.u8("ordersTakingBlocked"),
    borsh.u16("hostFeeBps"),
    borsh.array(borsh.u8(), 2, "padding0"),
    borsh.u64("orderCloseDelaySeconds"),
    borsh.array(borsh.u64(), 9, "padding1"),
    borsh.u64("pdaAuthorityPreviousLamportsBalance"),
    borsh.u64("totalTipAmount"),
    borsh.u64("hostTipAmount"),
    borshAddress("pdaAuthority"),
    borsh.u64("pdaAuthorityBump"),
    borshAddress("adminAuthority"),
    borshAddress("adminAuthorityCached"),
    borsh.u64("txnFeeCost"),
    borsh.u64("ataCreationCost"),
    borsh.array(borsh.u64(), 241, "padding2"),
  ]);

  constructor(fields: GlobalConfigFields) {
    this.emergencyMode = fields.emergencyMode;
    this.flashTakeOrderBlocked = fields.flashTakeOrderBlocked;
    this.newOrdersBlocked = fields.newOrdersBlocked;
    this.ordersTakingBlocked = fields.ordersTakingBlocked;
    this.hostFeeBps = fields.hostFeeBps;
    this.padding0 = fields.padding0;
    this.orderCloseDelaySeconds = fields.orderCloseDelaySeconds;
    this.padding1 = fields.padding1;
    this.pdaAuthorityPreviousLamportsBalance =
      fields.pdaAuthorityPreviousLamportsBalance;
    this.totalTipAmount = fields.totalTipAmount;
    this.hostTipAmount = fields.hostTipAmount;
    this.pdaAuthority = fields.pdaAuthority;
    this.pdaAuthorityBump = fields.pdaAuthorityBump;
    this.adminAuthority = fields.adminAuthority;
    this.adminAuthorityCached = fields.adminAuthorityCached;
    this.txnFeeCost = fields.txnFeeCost;
    this.ataCreationCost = fields.ataCreationCost;
    this.padding2 = fields.padding2;
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID,
  ): Promise<GlobalConfig | null> {
    const info = await fetchEncodedAccount(rpc, address);

    if (!info.exists) {
      return null;
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `GlobalConfigFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`,
      );
    }

    return this.decode(Buffer.from(info.data));
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID,
  ): Promise<Array<GlobalConfig | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses);

    return infos.map((info) => {
      if (!info.exists) {
        return null;
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `GlobalConfigFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`,
        );
      }

      return this.decode(Buffer.from(info.data));
    });
  }

  static decode(data: Buffer): GlobalConfig {
    if (!data.slice(0, 8).equals(GlobalConfig.discriminator)) {
      throw new Error("invalid account discriminator");
    }

    const dec = GlobalConfig.layout.decode(data.slice(8));

    return new GlobalConfig({
      emergencyMode: dec.emergencyMode,
      flashTakeOrderBlocked: dec.flashTakeOrderBlocked,
      newOrdersBlocked: dec.newOrdersBlocked,
      ordersTakingBlocked: dec.ordersTakingBlocked,
      hostFeeBps: dec.hostFeeBps,
      padding0: dec.padding0,
      orderCloseDelaySeconds: dec.orderCloseDelaySeconds,
      padding1: dec.padding1,
      pdaAuthorityPreviousLamportsBalance:
        dec.pdaAuthorityPreviousLamportsBalance,
      totalTipAmount: dec.totalTipAmount,
      hostTipAmount: dec.hostTipAmount,
      pdaAuthority: dec.pdaAuthority,
      pdaAuthorityBump: dec.pdaAuthorityBump,
      adminAuthority: dec.adminAuthority,
      adminAuthorityCached: dec.adminAuthorityCached,
      txnFeeCost: dec.txnFeeCost,
      ataCreationCost: dec.ataCreationCost,
      padding2: dec.padding2,
    });
  }

  toJSON(): GlobalConfigJSON {
    return {
      emergencyMode: this.emergencyMode,
      flashTakeOrderBlocked: this.flashTakeOrderBlocked,
      newOrdersBlocked: this.newOrdersBlocked,
      ordersTakingBlocked: this.ordersTakingBlocked,
      hostFeeBps: this.hostFeeBps,
      padding0: this.padding0,
      orderCloseDelaySeconds: this.orderCloseDelaySeconds.toString(),
      padding1: this.padding1.map((item) => item.toString()),
      pdaAuthorityPreviousLamportsBalance:
        this.pdaAuthorityPreviousLamportsBalance.toString(),
      totalTipAmount: this.totalTipAmount.toString(),
      hostTipAmount: this.hostTipAmount.toString(),
      pdaAuthority: this.pdaAuthority,
      pdaAuthorityBump: this.pdaAuthorityBump.toString(),
      adminAuthority: this.adminAuthority,
      adminAuthorityCached: this.adminAuthorityCached,
      txnFeeCost: this.txnFeeCost.toString(),
      ataCreationCost: this.ataCreationCost.toString(),
      padding2: this.padding2.map((item) => item.toString()),
    };
  }

  static fromJSON(obj: GlobalConfigJSON): GlobalConfig {
    return new GlobalConfig({
      emergencyMode: obj.emergencyMode,
      flashTakeOrderBlocked: obj.flashTakeOrderBlocked,
      newOrdersBlocked: obj.newOrdersBlocked,
      ordersTakingBlocked: obj.ordersTakingBlocked,
      hostFeeBps: obj.hostFeeBps,
      padding0: obj.padding0,
      orderCloseDelaySeconds: new BN(obj.orderCloseDelaySeconds),
      padding1: obj.padding1.map((item) => new BN(item)),
      pdaAuthorityPreviousLamportsBalance: new BN(
        obj.pdaAuthorityPreviousLamportsBalance,
      ),
      totalTipAmount: new BN(obj.totalTipAmount),
      hostTipAmount: new BN(obj.hostTipAmount),
      pdaAuthority: address(obj.pdaAuthority),
      pdaAuthorityBump: new BN(obj.pdaAuthorityBump),
      adminAuthority: address(obj.adminAuthority),
      adminAuthorityCached: address(obj.adminAuthorityCached),
      txnFeeCost: new BN(obj.txnFeeCost),
      ataCreationCost: new BN(obj.ataCreationCost),
      padding2: obj.padding2.map((item) => new BN(item)),
    });
  }
}
