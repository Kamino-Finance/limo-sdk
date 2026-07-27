import { initializeClient } from "./utils";
import { getLimoProgramId } from "../utils";
import { LimoClient } from "../Limo";
import { UpdateGlobalConfigMode, UpdateOrderMode } from "../utils/programModes";
import { Address, address } from "@solana/kit";

const RFQ_VENUE_LABELS = (blocked: number): string => {
  if (blocked === 0) return "all venues enabled";
  const off: string[] = [];
  if (blocked & 1) off.push("krfq");
  if (blocked & 2) off.push("per");
  return `disabled: ${off.join(", ")}`;
};

export async function getGlobalConfig(globalConfigString: string | undefined) {
  const rpc = process.env.RPC_ENV;
  const admin = process.env.ADMIN;
  const globalConfig = globalConfigString
    ? globalConfigString
    : process.env.LIMO_GLOBAL_CONFIG;
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  const c = await client.getGlobalConfigState();

  console.log(`Global Config: ${globalConfig}`);
  console.log(`  emergencyMode             : ${c.emergencyMode}`);
  console.log(`  flashTakeOrderBlocked     : ${c.flashTakeOrderBlocked}`);
  console.log(`  newOrdersBlocked          : ${c.newOrdersBlocked}`);
  console.log(`  ordersTakingBlocked       : ${c.ordersTakingBlocked}`);
  console.log(`  hostFeeBps                : ${c.hostFeeBps}`);
  console.log(
    `  rfqVenuesBlocked          : ${c.rfqVenuesBlocked} (${RFQ_VENUE_LABELS(c.rfqVenuesBlocked)})`,
  );
  console.log(`  orderCloseDelaySeconds    : ${c.orderCloseDelaySeconds}`);
  console.log(`  txnFeeCost                : ${c.txnFeeCost}`);
  console.log(`  ataCreationCost           : ${c.ataCreationCost}`);
  console.log(`  pdaAuthority              : ${c.pdaAuthority}`);
  console.log(`  pdaAuthorityBump          : ${c.pdaAuthorityBump}`);
  console.log(`  adminAuthority            : ${c.adminAuthority}`);
  console.log(`  adminAuthorityCached      : ${c.adminAuthorityCached}`);
  console.log(`  totalTipAmount            : ${c.totalTipAmount}`);
  console.log(`  hostTipAmount             : ${c.hostTipAmount}`);
  console.log(
    `  pdaAuthorityPrevLamports  : ${c.pdaAuthorityPreviousLamportsBalance}`,
  );
}

export async function updateGlobalConfig(
  updateMode: string,
  value: string,
  mode: string,
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  let valueCasted: number | Address;

  switch (
    UpdateGlobalConfigMode.fromDecoded({ [updateMode]: "" }).discriminator
  ) {
    case UpdateGlobalConfigMode.UpdateEmergencyMode.discriminator:
    case UpdateGlobalConfigMode.UpdateBlockNewOrders.discriminator:
    case UpdateGlobalConfigMode.UpdateBlockOrderTaking.discriminator:
    case UpdateGlobalConfigMode.UpdateFlashTakeOrderBlocked.discriminator:
    case UpdateGlobalConfigMode.UpdateHostFeeBps.discriminator:
    case UpdateGlobalConfigMode.UpdateOrderTakingPermissionless.discriminator:
    case UpdateGlobalConfigMode.UpdateOrderCloseDelaySeconds.discriminator:
    case UpdateGlobalConfigMode.UpdateTxnFeeCost.discriminator:
    case UpdateGlobalConfigMode.UpdateAtaCreationCost.discriminator:
    case UpdateGlobalConfigMode.UpdateRfqVenuesBlocked.discriminator:
      valueCasted = Number(value);
      break;
    case UpdateGlobalConfigMode.UpdateAdminAuthorityCached.discriminator:
      valueCasted = address(value);
      break;
    default:
      throw new Error("Invalid mode");
  }
  await client.getGlobalConfigState();
  await client.updateGlobalConfig(env.admin, updateMode, valueCasted, mode);

  console.log("Global Config updated");
}

export async function updateGlobalConfigAdmin(
  globalConfigString: string | undefined,
  mode: string,
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = globalConfigString
    ? globalConfigString
    : process.env.LIMO_GLOBAL_CONFIG;
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  await client.updateGlobalConfigAdmin(env.admin, mode);

  console.log("Global Config Admin updated");
}

export async function updateOrder(
  order: Address,
  updateMode: string,
  value: string,
  mode: string,
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  let valueCasted: boolean | Address;

  switch (UpdateOrderMode.fromDecoded({ [updateMode]: "" }).discriminator) {
    case UpdateOrderMode.UpdatePermissionless.discriminator:
      valueCasted = Boolean(value);
      break;
    case UpdateOrderMode.UpdateCounterparty.discriminator:
      valueCasted = address(value);
      break;
    default:
      throw new Error("Invalid mode");
  }

  await client.updateOrder(env.admin, updateMode, valueCasted, order, mode);

  console.log("Order updated");
}
