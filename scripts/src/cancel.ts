import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  EscrowLayout,
  ESCROW_ACCOUNT_DATA_LAYOUT,
  getKeypair,
  getProgramId,
  getPublicKey,
  getTokenBalance,
  logError,
} from "./utils";

const cancel = async () => {
  const escrowProgramId = getProgramId();
  const aliceXTokenAccountPubkey = getPublicKey("alice_x");
  const aliceKeypair = getKeypair("alice");
  const escrowStateAccountPubkey = getPublicKey("escrow");

  const connection = new Connection("http://localhost:8899", "confirmed");
  const escrowAccount = await connection.getAccountInfo(
    escrowStateAccountPubkey
  );
  if (escrowAccount === null) {
    logError("Could not find escrow at given address!");
    process.exit(1);
  }
  const encodedEscrowState = escrowAccount.data;
  const decodedEscrowLayout = ESCROW_ACCOUNT_DATA_LAYOUT.decode(
    encodedEscrowState
  ) as EscrowLayout;
  const escrowState = {
    initializerAccountPubkey: new PublicKey(
      decodedEscrowLayout.initializerPubkey
    ),
    XTokenTempAccountPubkey: new PublicKey(
      decodedEscrowLayout.initializerTempTokenAccountPubkey
    ),
  };

  const PDA = await PublicKey.findProgramAddress(
    [Buffer.from("escrow")],
    escrowProgramId
  );

  const cancelInstruction = new TransactionInstruction({
    programId: escrowProgramId,
    data: Buffer.from(Uint8Array.of(2)),
    keys: [
      {
        pubkey: escrowState.initializerAccountPubkey,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: escrowState.XTokenTempAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: aliceXTokenAccountPubkey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: escrowStateAccountPubkey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: PDA[0], isSigner: false, isWritable: false },
    ],
  });

  const [aliceXbalance, escrowXbalance] = await Promise.all([
    getTokenBalance(aliceXTokenAccountPubkey, connection),
    getTokenBalance(escrowState.XTokenTempAccountPubkey, connection),
  ]);

  console.log("Sending cancel transaction...");
  await connection.sendTransaction(
    new Transaction().add(cancelInstruction),
    [aliceKeypair],
    { skipPreflight: false, preflightCommitment: "confirmed" }
  );

  // sleep to allow time to update
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (
    (await connection.getAccountInfo(escrowState.XTokenTempAccountPubkey)) !==
    null
  ) {
    logError("Temporary X token account has not been closed");
    process.exit(1);
  }

  const newAliceXbalance = await getTokenBalance(
    aliceXTokenAccountPubkey,
    connection
  );

  if (newAliceXbalance !== aliceXbalance + escrowXbalance) {
    logError(
      `Alice's X balance should be ${
        aliceXbalance + escrowXbalance
      } but is ${newAliceXbalance}`
    );
    process.exit(1);
  }

  console.log(
    "✨Cancel successfully executed. All temporary accounts closed✨\n"
  );
  console.table([
    {
      "Alice Token Account X": newAliceXbalance,
      "Alice Token Account Y": await getTokenBalance(
        getPublicKey("alice_y"),
        connection
      ),
    },
  ]);
};

cancel();
