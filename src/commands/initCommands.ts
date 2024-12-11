import { Keypair, PublicKey } from "@solana/web3.js";
import { GlobalConfig } from "../rpc_client/accounts";
import { initializeClient } from "./utils";
import { getLimoProgramId, parseKeypairFile } from "../utils";
import { LimoClient } from "../Limo";

export async function initGlobalConfigCommand(globalConfigFilePath?: string) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  console.log("rpc", rpc);
  const env = initializeClient(rpc!, admin!, getLimoProgramId(rpc!), false);
  const globalConfig = globalConfigFilePath
    ? parseKeypairFile(globalConfigFilePath)
    : Keypair.generate();
  const client = new LimoClient(env.provider.connection, undefined);
  await client.createGlobalConfig(env.admin, globalConfig);

  let globalConfigState: GlobalConfig | null = await GlobalConfig.fetch(
    env.provider.connection,
    globalConfig.publicKey,
  );
  console.log(
    "Global Config",
    globalConfig.publicKey.toString(),
    globalConfigState?.toJSON(),
  );
}

export async function initVault(mint: PublicKey, mode: string) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  const env = initializeClient(rpc!, admin!, getLimoProgramId(rpc!), false);
  const client = new LimoClient(
    env.provider.connection,
    new PublicKey(globalConfig!),
  );
  const vault = Keypair.generate();
  await client.initializeVault(env.admin, mint, mode);

  console.log("Vault", vault.publicKey.toString());
}
