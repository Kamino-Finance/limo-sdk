import { GlobalConfig } from "../rpc_client/accounts";
import { initializeClient } from "./utils";
import { getLimoProgramId, getTokenVaultPDA, parseKeypairFile } from "../utils";
import { LimoClient } from "../Limo";
import * as fs from "fs";
import { address, Address } from "@solana/kit";
import { generateKeyPairSigner } from "@solana/signers";

export async function initGlobalConfigCommand(globalConfigFilePath?: string) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  console.log("rpc", rpc);
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const globalConfig = globalConfigFilePath
    ? await parseKeypairFile(globalConfigFilePath)
    : await generateKeyPairSigner();
  const client = new LimoClient(env.rpc, env.rpcWs, undefined);
  await client.createGlobalConfig(env.admin, globalConfig);

  let globalConfigState: GlobalConfig | null = await GlobalConfig.fetch(
    env.rpc,
    globalConfig.address,
    env.programAddress,
  );
  console.log(
    "Global Config",
    globalConfig.toString(),
    globalConfigState?.toJSON(),
  );
}

export async function initVault(mint: Address, mode: string) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));
  let vault = await getTokenVaultPDA(
    client.getProgramID(),
    address(globalConfig!),
    mint,
  );

  await client.initializeVault(env.admin, mint, mode);

  mode !== "multisig" && console.log("Vault", vault.toString());
}

export async function initVaultsFromMintsListFile(
  mintsListFilePath: string,
  mode: string,
) {
  const admin = process.env.ADMIN;
  const rpc = process.env.RPC_ENV;
  const globalConfig = process.env.LIMO_GLOBAL_CONFIG;
  const env = await initializeClient(rpc!, admin!, getLimoProgramId(), false);
  const client = new LimoClient(env.rpc, env.rpcWs, address(globalConfig!));

  const fileContents = fs.readFileSync(mintsListFilePath, "utf8");

  // Parse the file contents into an array of mints
  let mints: string[];
  try {
    mints = JSON.parse(fileContents);
    if (!Array.isArray(mints)) {
      throw new Error("File doesn't have an array");
    }
  } catch (error) {
    console.error("Error parsing mints list file:", error);
    process.exit(1);
  }

  console.log("Mints to initialize vaults for:", mints.length);

  const mintsSet = new Set(mints.map((mint) => address(mint)));

  for (let mint of Array.from(mintsSet)) {
    const mintPk = address(mint);
    const vaultAddress = await getTokenVaultPDA(
      client.getProgramID(),
      address(globalConfig!),
      mintPk,
    );
    try {
      const vaultBalance = (await env.rpc.getAccountInfo(vaultAddress).send())
        ?.value?.lamports;
      if (vaultBalance! > 0) {
        mode !== "multisig" &&
          console.log(
            `Vault ${vaultAddress.toString()} already has a balance of ${vaultBalance} so is initialized`,
          );
        continue;
      }
    } catch (error) {
      // do nothing
    }

    await client.initializeVault(env.admin, mintPk, mode);

    mode !== "multisig" && console.log("Vault", vaultAddress.toString());
  }
}

export async function getAllMintsFromKaminoResources() {}

const API_URL = "https://cdn.kamino.finance/resources.json";

type Link = {
  title: string;
  url: string;
};

type TokenInfo = {
  heading: string;
  links: Link[];
  text: string;
  oracle: string;
  mint: string;
};

type Tokens = {
  [key: string]: TokenInfo;
};

export async function getKaminoTokenMintsFromApi() {
  console.log("Fetching mints from API...");
  const supportedTokenMints: Address[] = [];

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: any = await response.json();
    const tokensDict: Tokens = data["mainnet-beta"].tokens;
    for (const token of Object.values(tokensDict)) {
      supportedTokenMints.push(address(token.mint));
    }
  } catch (error) {
    console.log("Failed to fetch token mints:", error);
  }

  fs.writeFileSync(
    "./kaminoTokenMints.json",
    JSON.stringify(supportedTokenMints),
  );

  console.log("Written to: ", "./kaminoTokenMints.json");
}
