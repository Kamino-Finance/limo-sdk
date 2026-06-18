// Hand-maintained program enum helpers. The on-chain `update_global_config`
// and `update_order` instructions take a raw u16 `mode` plus raw value bytes,
// so Codama generates no enum for them. These map mode names <-> discriminators
// for building update instructions and decoding the order `status` byte.

export type ModeKind = {
  readonly discriminator: number;
  readonly kind: string;
};

function makeFromDecoded(variants: Record<string, ModeKind>) {
  return (obj: Record<string, unknown>): ModeKind => {
    const kind = Object.keys(obj)[0];
    const variant = variants[kind];
    if (!variant) {
      throw new Error(`Invalid enum object: ${JSON.stringify(obj)}`);
    }
    return variant;
  };
}

const UPDATE_GLOBAL_CONFIG_MODE_VARIANTS = {
  UpdateEmergencyMode: { discriminator: 0, kind: "UpdateEmergencyMode" },
  UpdateFlashTakeOrderBlocked: {
    discriminator: 1,
    kind: "UpdateFlashTakeOrderBlocked",
  },
  UpdateBlockNewOrders: { discriminator: 2, kind: "UpdateBlockNewOrders" },
  UpdateBlockOrderTaking: { discriminator: 3, kind: "UpdateBlockOrderTaking" },
  UpdateHostFeeBps: { discriminator: 4, kind: "UpdateHostFeeBps" },
  UpdateAdminAuthorityCached: {
    discriminator: 5,
    kind: "UpdateAdminAuthorityCached",
  },
  UpdateOrderTakingPermissionless: {
    discriminator: 6,
    kind: "UpdateOrderTakingPermissionless",
  },
  UpdateOrderCloseDelaySeconds: {
    discriminator: 7,
    kind: "UpdateOrderCloseDelaySeconds",
  },
  UpdateTxnFeeCost: { discriminator: 8, kind: "UpdateTxnFeeCost" },
  UpdateAtaCreationCost: { discriminator: 9, kind: "UpdateAtaCreationCost" },
} as const satisfies Record<string, ModeKind>;

export const UpdateGlobalConfigMode = {
  ...UPDATE_GLOBAL_CONFIG_MODE_VARIANTS,
  fromDecoded: makeFromDecoded(UPDATE_GLOBAL_CONFIG_MODE_VARIANTS),
};
export type UpdateGlobalConfigModeKind = ModeKind;

const UPDATE_ORDER_MODE_VARIANTS = {
  UpdatePermissionless: { discriminator: 0, kind: "UpdatePermissionless" },
  UpdateCounterparty: { discriminator: 1, kind: "UpdateCounterparty" },
} as const satisfies Record<string, ModeKind>;

export const UpdateOrderMode = {
  ...UPDATE_ORDER_MODE_VARIANTS,
  fromDecoded: makeFromDecoded(UPDATE_ORDER_MODE_VARIANTS),
};
export type UpdateOrderModeKind = ModeKind;

// Order account `status` byte values (see programs/limo OrderStatus).
export const OrderStatus = {
  Active: 0,
  Filled: 1,
  Cancelled: 2,
} as const;
