import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  SimulateTransactionConfig,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

describe("sensorstream - submitReading works", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sensorstream as Program<any>;

  const bot = anchor.web3.Keypair.generate();
  let bufferPda: anchor.web3.PublicKey;

  const ts = new anchor.BN(Math.floor(Date.now() / 1000));
  let tsBump = 0;

  before(async () => {
    [bufferPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("sensor"), bot.publicKey.toBuffer()],
      program.programId,
    );

    const airdropSig = await provider.connection.requestAirdrop(
      bot.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      signature: airdropSig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
  });

  it("happy path submit", async () => {
    const value = 42;

    await program.methods
      .submitReading(value, ts)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    // Fetch the account data to verify the values
    const bufferData = await program.account.sensorBuffer.fetch(bufferPda);

    // Ensure the data has been written correctly (check the first reading)
    const firstReading = bufferData.readings[0]; // Assuming the first reading is written
    assert.equal(firstReading.value, 42); // Check if value is written
    assert.equal(firstReading.timestamp.toNumber(), ts.toNumber()); // Check if timestamp is written
  });

  it("stale timestamp fails", async () => {
    tsBump += 2;
    const firstTs = new anchor.BN(ts.toNumber() + tsBump);
    const secondTs = new anchor.BN(firstTs.toNumber() - 1); // stale

    // first write
    await program.methods
      .submitReading(1, firstTs)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    // second write should fail
    try {
      await program.methods
        .submitReading(2, secondTs)
        .accounts({
          bot: bot.publicKey,
          buffer: bufferPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([bot])
        .rpc();
      assert.fail("Stale timestamp should have failed");
    } catch (err) {
      const error = err as Error;
      assert.include(
        error.message,
        "AnchorError occurred. Error Code: StaleTimestamp.",
        "Expected 'StaleTimestamp' error but got: " + error.message,
      );
      assert.ok("Expected error thrown");
    }
  });

  it("subsequent updates are recorded correctly", async () => {
    const firstValue = 1000;
    const secondValue = 2000;

    tsBump += 1;
    const firstTs = new anchor.BN(ts.toNumber() + tsBump);
    tsBump += 1;
    const secondTs = new anchor.BN(ts.toNumber() + tsBump);

    const bufferSize = (await program.account.sensorBuffer.fetch(bufferPda))
      .readings.length;

    const firstIndex = (await program.account.sensorBuffer.fetch(bufferPda))
      .idx;
    const secondIndex = (firstIndex + 1) % bufferSize;

    // first write
    await program.methods
      .submitReading(firstValue, firstTs)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    // second write
    await program.methods
      .submitReading(secondValue, secondTs)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    const bufferData = await program.account.sensorBuffer.fetch(bufferPda);

    const firstReading = bufferData.readings[firstIndex];
    const secondReading = bufferData.readings[secondIndex];

    assert.equal(firstValue, firstReading.value);
    assert.equal(secondValue, secondReading.value);

    assert.equal(firstTs.toNumber(), firstReading.timestamp.toNumber());
    assert.equal(secondTs.toNumber(), secondReading.timestamp.toNumber());
  });

  it("wrap around works correctly", async () => {
    const bufferSize = (await program.account.sensorBuffer.fetch(bufferPda))
      .readings.length;

    const lastIdx = bufferSize - 1;
    const fillValue = 5000;

    let isLastIdx =
      (await program.account.sensorBuffer.fetch(bufferPda)).idx == lastIdx;

    while (!isLastIdx) {
      tsBump += 1;
      let fillTs = new anchor.BN(ts.toNumber() + tsBump);

      await program.methods
        .submitReading(fillValue, fillTs)
        .accounts({
          bot: bot.publicKey,
          buffer: bufferPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([bot])
        .rpc();

      isLastIdx =
        (await program.account.sensorBuffer.fetch(bufferPda)).idx == lastIdx;
    }

    assert.equal(
      (await program.account.sensorBuffer.fetch(bufferPda)).idx,
      lastIdx,
    );

    const firstValue = 1000;
    const secondValue = 2000;

    tsBump += 1;
    const firstTs = new anchor.BN(ts.toNumber() + tsBump);
    tsBump += 1;
    const secondTs = new anchor.BN(ts.toNumber() + tsBump);

    const firstIndex = (await program.account.sensorBuffer.fetch(bufferPda))
      .idx;
    const secondIndex = (firstIndex + 1) % bufferSize;

    // first write
    await program.methods
      .submitReading(firstValue, firstTs)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    // second write
    await program.methods
      .submitReading(secondValue, secondTs)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    const bufferData = await program.account.sensorBuffer.fetch(bufferPda);

    const firstReading = bufferData.readings[firstIndex];
    const secondReading = bufferData.readings[secondIndex];

    assert.equal(firstValue, firstReading.value);
    assert.equal(secondValue, secondReading.value);

    assert.equal(firstTs.toNumber(), firstReading.timestamp.toNumber());
    assert.equal(secondTs.toNumber(), secondReading.timestamp.toNumber());
  });
});

describe("sensorstream - bench", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sensorstream as Program<any>;

  const bot = anchor.web3.Keypair.generate();
  let bufferPda: anchor.web3.PublicKey;

  const ts = new anchor.BN(Math.floor(Date.now() / 1000));

  before(async () => {
    [bufferPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("sensor"), bot.publicKey.toBuffer()],
      program.programId,
    );

    const airdropSig = await provider.connection.requestAirdrop(
      bot.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      signature: airdropSig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
  });

  it("sensorstream - compute units check - submitReading init", async () => {
    const computeBudget = 90000;
    const value = 42;

    const ix = await program.methods
      .submitReading(value, ts)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const { blockhash } =
      await program.provider.connection.getLatestBlockhash();

    const config: SimulateTransactionConfig = {
      sigVerify: true,
      commitment: "processed",
    };

    const messageV0 = new TransactionMessage({
      payerKey: bot.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const versionedTx = new VersionedTransaction(messageV0);
    versionedTx.sign([bot]);

    const simulationResult = await provider.connection.simulateTransaction(
      versionedTx,
      config,
    );

    assert.isTrue(
      simulationResult.value.unitsConsumed < computeBudget,
      "Tx not within budget",
    );
  });

  it("sensorstream - compute units check - submitReading update", async () => {
    const computeBudget = 90000;
    const value = 42;
    const ts2 = new anchor.BN(ts.toNumber() + 1);

    await program.methods
      .submitReading(value, ts)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bot])
      .rpc();

    const ix = await program.methods
      .submitReading(value, ts2)
      .accounts({
        bot: bot.publicKey,
        buffer: bufferPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const { blockhash } =
      await program.provider.connection.getLatestBlockhash();

    const config: SimulateTransactionConfig = {
      sigVerify: true,
      commitment: "processed",
    };

    const messageV0 = new TransactionMessage({
      payerKey: bot.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const versionedTx = new VersionedTransaction(messageV0);
    versionedTx.sign([bot]);

    const simulationResult = await provider.connection.simulateTransaction(
      versionedTx,
      config,
    );

    assert.isTrue(
      simulationResult.value.unitsConsumed < computeBudget,
      "Tx not within budget",
    );
  });
});
