import { address } from "@solana/kit";
import { LIMO_PROGRAM_ADDRESS } from "../rpc_client/generated/programs";

// Leaf module: must not import from ../Limo (or anything that does) to stay cycle-free.
export function getLimoProgramId() {
  // Allow overriding the program ID via env (e.g. staging) without touching the default.
  const override =
    typeof process !== "undefined"
      ? process.env?.LIMO_PROGRAM_ID?.trim()
      : undefined;
  if (!override) {
    return address(LIMO_PROGRAM_ADDRESS);
  }
  try {
    return address(override);
  } catch {
    throw new Error(
      `LIMO_PROGRAM_ID env override is not a valid address: "${override}"`,
    );
  }
}
