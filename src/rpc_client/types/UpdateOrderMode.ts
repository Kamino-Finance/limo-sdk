import { address, Address } from "@solana/kit"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh";
import { borshAddress } from "../utils";

export interface UpdatePermissionlessJSON {
  kind: "UpdatePermissionless";
}

export class UpdatePermissionless {
  static readonly discriminator = 0;
  static readonly kind = "UpdatePermissionless";
  readonly discriminator = 0;
  readonly kind = "UpdatePermissionless";

  toJSON(): UpdatePermissionlessJSON {
    return {
      kind: "UpdatePermissionless",
    };
  }

  toEncodable() {
    return {
      UpdatePermissionless: {},
    };
  }
}

export interface UpdateCounterpartyJSON {
  kind: "UpdateCounterparty";
}

export class UpdateCounterparty {
  static readonly discriminator = 1;
  static readonly kind = "UpdateCounterparty";
  readonly discriminator = 1;
  readonly kind = "UpdateCounterparty";

  toJSON(): UpdateCounterpartyJSON {
    return {
      kind: "UpdateCounterparty",
    };
  }

  toEncodable() {
    return {
      UpdateCounterparty: {},
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateOrderModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object");
  }

  if ("UpdatePermissionless" in obj) {
    return new UpdatePermissionless();
  }
  if ("UpdateCounterparty" in obj) {
    return new UpdateCounterparty();
  }

  throw new Error("Invalid enum object");
}

export function fromJSON(
  obj: types.UpdateOrderModeJSON,
): types.UpdateOrderModeKind {
  switch (obj.kind) {
    case "UpdatePermissionless": {
      return new UpdatePermissionless();
    }
    case "UpdateCounterparty": {
      return new UpdateCounterparty();
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "UpdatePermissionless"),
    borsh.struct([], "UpdateCounterparty"),
  ]);
  if (property !== undefined) {
    return ret.replicate(property);
  }
  return ret;
}
