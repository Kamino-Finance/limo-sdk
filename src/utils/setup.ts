import {
  amountToLamportsDecimal,
  Cluster,
  createMint,
  endpointFromCluster,
  getAssociatedTokenAddress,
  getLimoProgramId,
  getPdaAuthority,
  getTokenVaultPDA,
  GlobalAccounts,
  mintTo,
  parseKeypairFile,
  setupAta,
  sleep,
  solAirdrop,
  subscriptionEndpointFromCluster,
  TokenInfo,
  UserAccounts,
} from "./utils";
import Decimal from "decimal.js";
import { LimoClient, WRAPPED_SOL_MINT } from "../Limo";
import { generateKeyPairSigner } from "@solana/signers";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  Address,
  KeyPairSigner,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionSigner,
} from "@solana/kit";

export type Env = {
  rpc: Rpc<SolanaRpcApi>;
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  programAddress: Address;
  admin: TransactionSigner;
  cluster: Cluster;
};

export async function setUpProgram(args: {
  clusterOverride?: string;
  adminFilePath?: string;
  programOverride?: Address;
}): Promise<Env> {
  // Cluster & admin
  if (!args.clusterOverride) {
    throw new Error("Cluster is required");
  }

  const cluster = args.clusterOverride;
  const rpc = createSolanaRpc(endpointFromCluster(cluster));
  const rpcWs = createSolanaRpcSubscriptions(
    subscriptionEndpointFromCluster(cluster),
  );

  const payer = args.adminFilePath
    ? await parseKeypairFile(args.adminFilePath)
    : await generateKeyPairSigner();

  const admin = payer;

  // Programs
  const limoProgramId = args.programOverride || getLimoProgramId();

  return {
    rpc,
    rpcWs,
    admin,
    programAddress: limoProgramId,
    cluster: cluster as Cluster,
  };
}

export async function createGlobalAccounts(
  env: Env,
  owner: TransactionSigner = env.admin,
  tokenSymbols: string[] = ["SOL", "USDC", "KMNO"],
): Promise<GlobalAccounts> {
  const globalConfig: KeyPairSigner = await generateKeyPairSigner();
  const tokenInfos: Map<string, TokenInfo> = new Map();
  const tokenVaults: Map<string, Address> = new Map();

  for (const token of tokenSymbols) {
    if (token === "SOL") {
      tokenInfos.set(token, new TokenInfo(token, WRAPPED_SOL_MINT, 9));
      let tokenVault = await getTokenVaultPDA(
        env.programAddress,
        globalConfig.address,
        WRAPPED_SOL_MINT,
      );
      tokenVaults.set(token, tokenVault);
      await solAirdrop(env.rpc, env.rpcWs, owner.address, new Decimal(100));
    } else {
      const mint = await createMint(env.rpc, env.rpcWs, env.admin, 6);

      let tokenVault = await getTokenVaultPDA(
        env.programAddress,
        globalConfig.address,
        mint,
      );
      tokenInfos.set(token, new TokenInfo(token, mint, 6));
      tokenVaults.set(token, tokenVault);

      const tokenAta = await setupAta(env.rpc, env.rpcWs, mint, owner);
      await mintTo(
        env.rpc,
        env.rpcWs,
        env.admin,
        mint,
        tokenAta,
        amountToLamportsDecimal(new Decimal(100000.0), 6).toNumber(),
        6,
      );
    }
  }

  let pdaAuthority = await getPdaAuthority(
    env.programAddress,
    globalConfig.address,
  );

  const limoClient = new LimoClient(env.rpc, env.rpcWs, undefined);

  const globalAccounts: GlobalAccounts = {
    globalAdmin: owner,
    globalConfig,
    pdaAuthority,
    tokens: tokenInfos,
    vaults: tokenVaults,
    limoClient,
  };

  await solAirdrop(env.rpc, env.rpcWs, pdaAuthority, new Decimal(0.1));

  return globalAccounts;
}

export async function setGlobalAccounts(
  env: Env,
  owner: TransactionSigner = env.admin,
  skipInitVaults: boolean = false,
): Promise<GlobalAccounts> {
  const globalAccounts = await createGlobalAccounts(env, owner);
  const limoClient = globalAccounts.limoClient;

  await limoClient.createGlobalConfig(
    globalAccounts.globalAdmin,
    globalAccounts.globalConfig,
  );

  limoClient.setGlobalConfig(globalAccounts.globalConfig.address);

  if (!skipInitVaults) {
    for (const [, token] of globalAccounts.tokens.entries()) {
      await limoClient.initializeVault(globalAccounts.globalAdmin, token.mint);
    }
  }

  return globalAccounts;
}

export async function createUser(
  env: Env,
  globalAccounts: GlobalAccounts,
  tokenAndAirdropAmounts: { token: string; amount: Decimal }[],
  owner?: TransactionSigner,
): Promise<UserAccounts> {
  if (!owner) {
    owner = await generateKeyPairSigner();
  }

  const userAtas: Map<string, Address> = new Map();

  for (const { token, amount } of tokenAndAirdropAmounts) {
    const tokenInfo = globalAccounts.tokens.get(token)!;
    userAtas.set(
      token,
      await getAssociatedTokenAddress(owner.address, tokenInfo.mint),
    );
    if (amount.isZero()) {
      continue;
    }
    if (token === "SOL") {
      await solAirdrop(env.rpc, env.rpcWs, owner.address, amount);
      await sleep(1000);
    } else {
      const tokenAta = await setupAta(
        env.rpc,
        env.rpcWs,
        tokenInfo.mint,
        owner,
      );
      await mintTo(
        env.rpc,
        env.rpcWs,
        env.admin,
        tokenInfo.mint,
        tokenAta,
        amountToLamportsDecimal(amount, tokenInfo.mintDecimals).toNumber(),
        tokenInfo.mintDecimals,
      );
      await sleep(1000);
    }
  }

  const testingUser: UserAccounts = {
    owner,
    tokenAtas: userAtas,
  };

  return testingUser;
}
