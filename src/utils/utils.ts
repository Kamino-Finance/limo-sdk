import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { Decimal } from "decimal.js";
import { LimoClient, limoId, WRAPPED_SOL_MINT } from "../Limo";
import { GlobalConfig } from "../rpc_client/accounts";
import { PROGRAM_ID } from "../rpc_client/programId";

// @ts-ignore
import { Order } from "../rpc_client/accounts";
import {
  AccountRole,
  address,
  Address,
  airdropFactory,
  appendTransactionMessageInstructions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  createTransactionMessage,
  fetchEncodedAccount,
  getAddressEncoder,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  Instruction,
  Lamports,
  lamports,
  Option,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  Transaction,
  TransactionSigner,
} from "@solana/kit";
import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getBurnInstruction,
  getCloseAccountInstruction,
  getCreateAssociatedTokenInstructionAsync,
  getInitializeMintInstruction,
  getMintToCheckedInstruction,
  getTokenSize,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  addSignersToTransactionMessage,
  generateKeyPairSigner,
} from "@solana/signers";
import { fetchMint } from "@solana-program/token-2022";
import { BN } from "@coral-xyz/anchor/dist/cjs";

export const DEFAULT_ADDRESS = address("11111111111111111111111111111111");
export const DEFAULT_TXN_FEE_LAMPORTS = 5000;

const ESCROW_VAULT_SEED = "escrow_vault";
const GLOBAL_AUTH_SEED = "authority";
const EXPRESS_RELAY_MEATADATA_SEED = "metadata";
const EXPRESS_RELAY_CONFIG_ROUTER_SEED = "config_router";
const INTERMEDIARY_OUTPUT_TOKEN_ACCOUNT_SEED = "intermediary";
const EVENT_AUTHORITY_SEED = "__event_authority";

export interface GlobalAccounts {
  globalAdmin: TransactionSigner;
  globalConfig: TransactionSigner;

  pdaAuthority: Address;

  tokens: Map<string, TokenInfo>;

  vaults: Map<string, Address>;

  limoClient: LimoClient;
}

export class TokenInfo {
  symbol: string;
  mint: Address;
  mintDecimals: number;

  constructor(symbol: string, mint: Address, mintDecimal: number) {
    this.symbol = symbol;
    this.mint = mint;
    this.mintDecimals = mintDecimal;
  }
}

export interface UserAccounts {
  owner: TransactionSigner;
  tokenAtas: Map<string, Address>;
}

export function getLimoProgramId() {
  return PROGRAM_ID;
}

export async function parseKeypairFile(
  file: string,
): Promise<TransactionSigner> {
  const keypairFile = require("fs").readFileSync(file);
  const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));

  const keypair = await createKeyPairFromBytes(keypairBytes);

  return createSignerFromKeyPair(keypair);
}

export function divCeil(a: BN, b: BN): BN {
  return a.add(b).sub(new BN(1)).div(b);
}

export function amountToLamportsBN(amount: Decimal, decimals: number): BN {
  let factor = Math.pow(10, decimals);
  return new BN(amount.mul(factor).floor().toString());
}

export function amountToLamportsDecimal(
  amount: Decimal,
  decimals: number,
): Decimal {
  let factor = Math.pow(10, decimals);
  return amount.mul(factor);
}

export function lamportsToAmountBN(amount: BN, decimals: number): Decimal {
  let factor = new BN(Math.pow(10, decimals));
  return new Decimal(amount.div(factor).toString());
}

export function lamportsToAmountDecimal(
  amount: Decimal,
  decimals: number,
): Decimal {
  let factor = Math.pow(10, decimals);
  return amount.div(factor);
}

export async function createMint(
  rpc: Rpc<SolanaRpcApi>,
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  authority: TransactionSigner,
  decimals: number = 6,
): Promise<Address> {
  const mint = await generateKeyPairSigner();
  return await createMintFromKeypair(rpc, rpcWs, authority, mint, decimals);
}

export async function createMintFromKeypair(
  rpc: Rpc<SolanaRpcApi>,
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  authority: TransactionSigner,
  mint: TransactionSigner,
  decimals: number = 6,
): Promise<Address> {
  const instructions = await createMintInstructions(
    rpc,
    authority,
    mint,
    decimals,
  );
  console.log("Mint auth", authority.address);

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }), // Create transaction message
    (tx) => setTransactionMessageFeePayerSigner(authority, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);

  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: rpcWs })(
    signedTransaction,
    { commitment: "confirmed" },
  );
  return mint.address;
}

export async function getMintDecimals(
  rpc: Rpc<SolanaRpcApi>,
  mint: Address,
): Promise<number> {
  let info = await fetchMint(rpc, mint);
  return info.data.decimals;
}

async function createMintInstructions(
  rpc: Rpc<SolanaRpcApi>,
  authority: TransactionSigner,
  mint: TransactionSigner,
  decimals: number,
): Promise<Instruction[]> {
  return [
    getCreateAccountInstruction({
      payer: authority,
      newAccount: mint,
      lamports: await rpc.getMinimumBalanceForRentExemption(BigInt(82)).send(),
      space: 82,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction({
      mint: mint.address,
      decimals: decimals,
      mintAuthority: authority.address,
    }),
  ];
}

export async function printMultisigTx(tx: Transaction) {
  console.log(getBase58Decoder().decode(tx.messageBytes));
}

export async function printSimulateTx(rpc: Rpc<SolanaRpcApi>, tx: Transaction) {
  console.log(
    "Tx in B64",
    `https://explorer.solana.com/tx/inspector?message=${encodeURIComponent(
      Buffer.from(tx.messageBytes).toString("base64"),
    )}`,
  );

  let res = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(tx), {
      encoding: "base64",
    })
    .send();
  console.log("Simulate Response", res.value);
  console.log("");
}

export async function solAirdrop(
  rpc: Rpc<SolanaRpcApi>,
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  account: Address,
  solAirdrop: Decimal,
): Promise<Decimal> {
  await airdropFactory({ rpc, rpcSubscriptions: rpcWs })({
    recipientAddress: account,
    lamports: lamports(
      BigInt(amountToLamportsDecimal(solAirdrop, 9).toString()),
    ),
    commitment: "confirmed",
  });
  return await getSolBalance(rpc, account);
}

export async function checkIfAccountExists(
  rpc: Rpc<SolanaRpcApi>,
  account: Address,
): Promise<boolean> {
  const acc = await fetchEncodedAccount(rpc, account);
  return acc.exists;
}

export async function getAssociatedTokenAddress(
  ownerAddress: Address,
  tokenMintAddress: Address,
  tokenProgramAddress: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<Address> {
  const [associatedTokenAddress] = await findAssociatedTokenPda({
    mint: tokenMintAddress,
    owner: ownerAddress,
    tokenProgram: tokenProgramAddress,
  });
  return associatedTokenAddress;
}

export async function createAssociatedTokenAccountIdempotentInstruction(
  owner: Address,
  mint: Address,
  payer: TransactionSigner,
  tokenProgramAddress?: Address,
  ata?: Address,
): Promise<[Address, Instruction]>;
export async function createAssociatedTokenAccountIdempotentInstruction(
  owner: TransactionSigner,
  mint: Address,
  payer?: undefined,
  tokenProgramAddress?: Address,
  ata?: Address,
): Promise<[Address, Instruction]>;
export async function createAssociatedTokenAccountIdempotentInstruction(
  owner: Address | TransactionSigner,
  mint: Address,
  payer?: TransactionSigner,
  tokenProgramAddress: Address = TOKEN_PROGRAM_ADDRESS,
  ata?: Address,
): Promise<[Address, Instruction]> {
  const actualPayer = payer || (owner as TransactionSigner);
  const ownerAddress = typeof owner === "string" ? owner : owner.address;

  let ataAddress = ata;
  if (!ataAddress) {
    ataAddress = await getAssociatedTokenAddress(
      ownerAddress,
      mint,
      tokenProgramAddress,
    );
  }
  const createUserTokenAccountIx =
    await getCreateAssociatedTokenInstructionAsync({
      payer: actualPayer,
      mint,
      owner: ownerAddress,
    });

  // - discriminator 0: regular create (fails if account exists)
  // - discriminator 1: idempotent create (succeeds if account exists)
  const IDEMPOTENT_CREATE_DISCRIMINATOR = 1;

  const idempotentCreateUserTokenAccountIx = {
    ...createUserTokenAccountIx,
    data: new Uint8Array([
      IDEMPOTENT_CREATE_DISCRIMINATOR,
      ...createUserTokenAccountIx.data.slice(1),
    ]),
  };
  return [ataAddress, idempotentCreateUserTokenAccountIx];
}

export async function createAtaIdempotent(
  user: Address,
  payer: TransactionSigner,
  mint: Address,
  mintTokenProgramAddress: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<{ ata: Address; createAtaIx: Instruction }> {
  const [ata, createAtaIx] =
    await createAssociatedTokenAccountIdempotentInstruction(
      user,
      mint,
      payer,
      mintTokenProgramAddress,
    );

  return { ata, createAtaIx };
}

export async function setupAta(
  rpc: Rpc<SolanaRpcApi>,
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  tokenMintAddress: Address,
  payer: TransactionSigner,
  owner: TransactionSigner = payer,
): Promise<Address> {
  const ata = await getAssociatedTokenAddress(owner.address, tokenMintAddress);
  const accountExists = await checkIfAccountExists(rpc, ata);

  if (!accountExists) {
    const [, ix] = await createAssociatedTokenAccountIdempotentInstruction(
      owner.address,
      tokenMintAddress,
      payer,
      TOKEN_PROGRAM_ADDRESS,
      ata,
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(payer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([ix], tx),
    );

    const signedTransaction =
      await signTransactionMessageWithSigners(transactionMessage);

    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: rpcWs })(
      signedTransaction,
      { commitment: "confirmed" },
    );
  }
  return ata;
}

export async function mintTo(
  rpc: Rpc<SolanaRpcApi>,
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  payer: TransactionSigner,
  mint: Address,
  tokenAccount: Address,
  amount: number,
  decimals: number,
) {
  // new implementation
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const ix = getMintToCheckedInstruction({
    mint, // mint
    token: tokenAccount, // receiver (sholud be a token account)
    mintAuthority: payer, // mint authority
    amount, // amount. if your decimals is 8, you mint 10^8 for 1 token.
    decimals,
  });

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([ix], tx),
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);

  await sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions: rpcWs,
  })(signedTransaction, { commitment: "confirmed", skipPreflight: true });
}

export async function getMockSwapInstructions(
  authority: TransactionSigner,
  user: TransactionSigner,
  swapInputMint: Address,
  swapOutputMint: Address,
  swapInAmountDecimal: Decimal,
  swapOutAmountDecimal: Decimal,
  inTokenDecimals: number,
  outTokenDecimals: number,
): Promise<Instruction[]> {
  let mintToIx: Instruction[] = [];
  if (swapOutputMint === WRAPPED_SOL_MINT) {
    // transfer WSOL to user
    mintToIx.push(
      getTransferSolInstruction({
        source: authority,
        destination: await getAssociatedTokenAddress(
          user.address,
          swapOutputMint,
        ),
        amount: amountToLamportsDecimal(
          swapOutAmountDecimal,
          outTokenDecimals,
        ).toNumber(),
      }),
    );
    mintToIx.push({
      programAddress: TOKEN_PROGRAM_ADDRESS,
      accounts: [
        {
          address: await getAssociatedTokenAddress(
            user.address,
            swapOutputMint,
          ),
          role: AccountRole.WRITABLE,
        },
      ],
      data: new Uint8Array([17]),
    } satisfies Instruction);
  } else {
    mintToIx.push(
      getMintToCheckedInstruction({
        mint: swapOutputMint,
        token: await getAssociatedTokenAddress(user.address, swapOutputMint),
        mintAuthority: authority,
        amount: amountToLamportsDecimal(
          swapOutAmountDecimal,
          outTokenDecimals,
        ).toNumber(),
        decimals: outTokenDecimals,
      }),
    );
  }

  let burnIx: Instruction[] = [];

  if (swapInputMint === WRAPPED_SOL_MINT) {
    burnIx.push(
      getCloseAccountInstruction({
        account: await getAssociatedTokenAddress(user.address, swapInputMint),
        destination: user.address,
        owner: user.address,
      }),
    ); // close WSOL ATA so sol is back to native
    burnIx.push(
      getTransferSolInstruction({
        source: user,
        destination: authority.address,
        amount: amountToLamportsDecimal(
          swapInAmountDecimal,
          inTokenDecimals,
        ).toNumber(),
      }),
    );
    burnIx.push(
      (await createAtaIdempotent(user.address, authority, WRAPPED_SOL_MINT))
        .createAtaIx,
    ); //reinitialise WSOL ATA as this is supposed to exist
  } else {
    burnIx.push(
      getBurnInstruction({
        account: await getAssociatedTokenAddress(user.address, swapInputMint),
        mint: swapInputMint,
        authority: user,
        amount: amountToLamportsDecimal(
          swapInAmountDecimal,
          inTokenDecimals,
        ).toNumber(),
      }),
    );
  }
  return [...burnIx, ...mintToIx];
}

export async function getMockSwapSingleInstructionSplOnly(
  authority: TransactionSigner,
  user: Address,
  swapOutputMint: Address,
  swapOutAmountDecimal: Decimal,
  outTokenDecimals: number,
): Promise<Instruction> {
  return getMintToCheckedInstruction({
    mint: swapOutputMint,
    token: await getAssociatedTokenAddress(user, swapOutputMint),
    mintAuthority: authority,
    amount: amountToLamportsDecimal(
      swapOutAmountDecimal,
      outTokenDecimals,
    ).toNumber(),
    decimals: outTokenDecimals,
  });
}

export async function getTokenAccountBalance(
  rpc: Rpc<SolanaRpcApi>,
  tokenAccount: Address,
): Promise<Decimal> {
  const tokenAccountBalance = await rpc
    .getTokenAccountBalance(tokenAccount)
    .send();
  return new Decimal(tokenAccountBalance.value.amount).div(
    Decimal.pow(10, tokenAccountBalance.value.decimals),
  );
}

export function createAddExtraComputeUnitFeeTransaction(
  units: number,
  microLamports: number,
): Instruction[] {
  const ixs: Instruction[] = [];
  ixs.push(getSetComputeUnitLimitInstruction({ units }));
  ixs.push(
    getSetComputeUnitPriceInstruction({
      microLamports: Number(microLamports.toFixed(0)),
    }),
  );
  return ixs;
}

export async function getSolBalanceInLamports(
  rpc: Rpc<SolanaRpcApi>,
  account: Address,
): Promise<bigint> {
  let balance: bigint | undefined = undefined;
  while (balance === undefined) {
    balance = (await rpc.getAccountInfo(account).send())?.value?.lamports;
  }
  return balance;
}

export async function getSolBalance(
  rpc: Rpc<SolanaRpcApi>,
  account: Address,
): Promise<Decimal> {
  const balance = new Decimal(
    (await getSolBalanceInLamports(rpc, account)).toString(),
  );
  return lamportsToAmountDecimal(balance, 9);
}

export type Cluster = "localnet" | "devnet" | "mainnet";

export function endpointFromCluster(cluster: string | undefined): string {
  switch (cluster) {
    case "mainnet":
      return "FIXTHIS";
    case "devnet":
      return "FIXTHIS";
    case "localnet":
      return "http://127.0.0.1:8899";
  }

  if (cluster) {
    return cluster;
  }

  return "err";
}

export function subscriptionEndpointFromCluster(
  cluster: string | undefined,
): string {
  switch (cluster) {
    case "mainnet":
      return "FIXTHIS";
    case "devnet":
      return "FIXTHIS";
    case "localnet":
      return "ws://127.0.0.1:8900";
  }

  if (cluster) {
    return cluster.replace(/^https?:\/\//, "wss://");
  }

  return "err";
}

export async function fetchGlobalConfigWithRetry(
  rpc: Rpc<SolanaRpcApi>,
  address: Address,
): Promise<GlobalConfig> {
  return fetchWithRetry(
    async () => await GlobalConfig.fetch(rpc, address),
    address,
  );
}

export async function getPdaAuthority(
  programAddress: Address,
  globalConfig: Address,
): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [pdaAuthority, _pdaAuthorityBump] = await getProgramDerivedAddress({
    programAddress,
    seeds: [GLOBAL_AUTH_SEED, addressEncoder.encode(globalConfig)],
  });

  return pdaAuthority;
}

export async function getTokenVaultPDA(
  programAddress: Address,
  globalConfig: Address,
  mint: Address,
): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [vault, _vaultBump] = await getProgramDerivedAddress({
    programAddress,
    seeds: [
      ESCROW_VAULT_SEED,
      addressEncoder.encode(globalConfig),
      addressEncoder.encode(mint),
    ],
  });

  return vault;
}

export async function getEventAuthorityPDA(
  programAddress: Address,
): Promise<Address> {
  const [eventAuthority, _eventAuthorityBump] = await getProgramDerivedAddress({
    programAddress,
    seeds: [EVENT_AUTHORITY_SEED],
  });

  return eventAuthority;
}

export async function getUserSwapBalanceStatePDA(
  maker: Address,
  programAddress: Address,
): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [swapBalanceState, _swapBalanceStateBump] =
    await getProgramDerivedAddress({
      programAddress,
      seeds: ["balances", addressEncoder.encode(maker)],
    });

  return swapBalanceState;
}

export async function getUserSwapBalanceAssertStatePDA(
  maker: Address,
  programAddress: Address,
): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [swapBalanceState, _swapBalanceStateBump] =
    await getProgramDerivedAddress({
      programAddress,
      seeds: ["assert_swap", addressEncoder.encode(maker)],
    });

  return swapBalanceState;
}

export async function getIntermediaryTokenAccountPDA(
  programAddress: Address,
  order: Address,
): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [intermediaryTokenAccount, _intermediaryTokenAccount] =
    await getProgramDerivedAddress({
      programAddress,
      seeds: [
        INTERMEDIARY_OUTPUT_TOKEN_ACCOUNT_SEED,
        addressEncoder.encode(order),
      ],
    });

  return intermediaryTokenAccount;
}

export async function getExpressRelayMetadataPDA(
  programAddress: Address,
): Promise<Address> {
  const [metadata, _metadataBump] = await getProgramDerivedAddress({
    programAddress,
    seeds: [EXPRESS_RELAY_MEATADATA_SEED],
  });

  return metadata;
}

export async function getExpressRelayConfigRouterPDA(
  programAddress: Address,
  router: Address,
): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [configRouter, _configRouterBump] = await getProgramDerivedAddress({
    programAddress,
    seeds: [EXPRESS_RELAY_CONFIG_ROUTER_SEED, addressEncoder.encode(router)],
  });

  return configRouter;
}

async function fetchWithRetry(
  fetch: () => Promise<any>,
  address: Address,
  retries: number = 3,
) {
  for (let i = 0; i < retries; i++) {
    let resp = await fetch();
    if (resp !== null) {
      return resp;
    }
    console.log(
      `[${i + 1}/${retries}] Fetched account ${address} is null. Refetching...`,
    );
  }
  return null;
}

export async function getOrderRentExemptLamports(
  rpc: Rpc<SolanaRpcApi>,
): Promise<Lamports> {
  return await rpc
    .getMinimumBalanceForRentExemption(BigInt(Order.layout.span + 8))
    .send();
}

export function createKeypairRentExemptIxSync(
  payer: TransactionSigner,
  account: TransactionSigner,
  size: number,
  lamports: bigint,
  programAddress: Address = limoId,
): Instruction {
  return getCreateAccountInstruction({
    payer: payer,
    newAccount: account,
    lamports: lamports,
    space: size,
    programAddress: programAddress,
  });
}

export async function executeTransaction(
  rpc: Rpc<SolanaRpcApi>,
  rpcWs: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  ixns: Instruction[],
  signer: TransactionSigner,
  extraSigners: TransactionSigner[] = [],
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(ixns, tx),
  );

  const transactionsMessageWithSigners = extraSigners.length
    ? addSignersToTransactionMessage(extraSigners, transactionMessage)
    : transactionMessage;

  const signedTransaction = await signTransactionMessageWithSigners(
    transactionsMessageWithSigners,
  );

  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: rpcWs })(
    signedTransaction,
    { commitment: "confirmed" },
  );
  return getSignatureFromTransaction(signedTransaction);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function asOption(address?: Address): Option<Address> {
  return address
    ? {
        value: address,
        __option: "Some",
      }
    : { __option: "None" };
}
