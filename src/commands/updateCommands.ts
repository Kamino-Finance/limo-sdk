import { initializeClient } from "./utils";
import { getLimoProgramId } from "../utils";
import { LimoClient } from "../Limo";
import { UpdateGlobalConfigMode, UpdateOrderMode } from "../rpc_client/types";
import { Address, address } from "@solana/kit";

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
