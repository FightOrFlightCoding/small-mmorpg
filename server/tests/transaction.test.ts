import assert from "node:assert/strict";
import test from "node:test";
import {
  TX_REASON_ADMIN_GRANT,
  TX_REASON_EQUIPMENT,
  TX_REASON_ITEM_DESTROY,
  TX_REASON_LOOT,
  TX_REASON_QUEST_REWARD,
  TX_REASON_TRADE,
  TX_REASON_VENDOR,
  memoryCommitter,
  simulateCommit,
  type TransactionWrite,
} from "../src/domain/transaction";
import { applyGoldMutation, emptyGoldLedger } from "../src/domain/wallet";

function write(extra: Partial<TransactionWrite> = {}): TransactionWrite {
  return {
    requestId: extra.requestId !== undefined ? extra.requestId : "req-gold-ok123",
    characterId: extra.characterId !== undefined ? extra.characterId : "char-alice",
    userId: extra.userId !== undefined ? extra.userId : "user-alice",
    reasonType: extra.reasonType !== undefined ? extra.reasonType : TX_REASON_ADMIN_GRANT,
    reasonId: extra.reasonId !== undefined ? extra.reasonId : "admin:grant",
    goldDelta: extra.goldDelta !== undefined ? extra.goldDelta : 10,
    currentGold: extra.currentGold !== undefined ? extra.currentGold : 5,
    inventory: extra.inventory,
    equipment: extra.equipment,
    questLog: extra.questLog,
    expectedVersions: extra.expectedVersions,
    currentVersions: extra.currentVersions,
    metadata: extra.metadata !== undefined ? extra.metadata : { source: "test" },
    ledger: extra.ledger,
  };
}

test("currency addition records character, delta, reason, request, and resulting balance", () => {
  const ledger = emptyGoldLedger();
  const result = applyGoldMutation(
    {
      characterId: "char-alice",
      currentGold: 7,
      delta: 25,
      reasonType: TX_REASON_QUEST_REWARD,
      reasonId: "quest.slime_problem",
      requestId: "req-gold-add001",
      metadata: { source: "quest" },
    },
    ledger,
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "ok");
  assert.equal(result.characterId, "char-alice");
  assert.equal(result.goldDelta, 25);
  assert.equal(result.reasonType, TX_REASON_QUEST_REWARD);
  assert.equal(result.reasonId, "quest.slime_problem");
  assert.equal(result.requestId, "req-gold-add001");
  assert.equal(result.resultingBalance, 32);
  assert.equal(result.gold, 32);
  assert.equal(result.metadata.source, "quest");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "clientBalance"), false);
});

test("currency removal subtracts gold through the same mutation helper", () => {
  const result = applyGoldMutation({
    characterId: "char-alice",
    currentGold: 40,
    delta: -15,
    reasonType: TX_REASON_VENDOR,
    reasonId: "vendor:future",
    requestId: "req-gold-sub001",
  });
  assert.equal(result.ok, true);
  assert.equal(result.goldDelta, -15);
  assert.equal(result.resultingBalance, 25);
});

test("insufficient gold is a structured failure and does not go negative", () => {
  const ledger = emptyGoldLedger();
  const result = applyGoldMutation(
    {
      characterId: "char-alice",
      currentGold: 4,
      delta: -10,
      reasonType: TX_REASON_TRADE,
      reasonId: "trade:future",
      requestId: "req-gold-nsf001",
    },
    ledger,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "insufficient_gold");
  assert.equal(result.goldDelta, 0);
  assert.equal(result.resultingBalance, 4);
  assert.equal(result.gold, 4);
});

test("duplicate gold requestId replays the stored balance without a second mutation", () => {
  const ledger = emptyGoldLedger();
  const first = applyGoldMutation(
    {
      characterId: "char-alice",
      currentGold: 10,
      delta: 5,
      reasonType: TX_REASON_ADMIN_GRANT,
      reasonId: "admin:dup",
      requestId: "req-gold-dup001",
    },
    ledger,
  );
  const second = applyGoldMutation(
    {
      characterId: "char-alice",
      currentGold: first.resultingBalance,
      delta: 5,
      reasonType: TX_REASON_ADMIN_GRANT,
      reasonId: "admin:dup",
      requestId: "req-gold-dup001",
    },
    ledger,
  );
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.resultingBalance, 15);
  assert.equal(second.goldDelta, 5);
});

test("transaction simulation commits loot, equipment, destroy, and admin grants without Nakama", () => {
  const commit = memoryCommitter();
  const loot = commit(
    write({
      requestId: "req-tx-loot001",
      reasonType: TX_REASON_LOOT,
      reasonId: "loot-gel",
      goldDelta: 0,
      currentGold: 3,
    }),
  );
  assert.equal(loot.ok, true);
  assert.equal(loot.audit.reasonType, TX_REASON_LOOT);
  assert.equal(loot.audit.characterId, "char-alice");
  assert.equal(loot.gold, 3);
  const equipment = commit(
    write({
      requestId: "req-tx-eq00001",
      reasonType: TX_REASON_EQUIPMENT,
      reasonId: "main_hand",
      goldDelta: 0,
      currentGold: 3,
    }),
  );
  assert.equal(equipment.ok, true);
  assert.equal(equipment.audit.reasonType, TX_REASON_EQUIPMENT);
  const destroy = commit(
    write({
      requestId: "req-tx-dst0001",
      reasonType: TX_REASON_ITEM_DESTROY,
      reasonId: "cloth-a",
      goldDelta: 0,
      currentGold: 3,
    }),
  );
  assert.equal(destroy.ok, true);
  const grant = commit(
    write({
      requestId: "req-tx-adm0001",
      reasonType: TX_REASON_ADMIN_GRANT,
      reasonId: "admin:gold",
      goldDelta: 12,
      currentGold: 3,
    }),
  );
  assert.equal(grant.ok, true);
  assert.equal(grant.gold, 15);
  assert.equal(grant.audit.resultingBalance, 15);
  assert.equal(grant.audit.goldDelta, 12);
  assert.equal(grant.audit.ok, true);
});

test("optimistic version mismatch is version_conflict and does not mutate gold", () => {
  const result = simulateCommit(
    write({
      requestId: "req-tx-ver0001",
      goldDelta: 50,
      currentGold: 10,
      expectedVersions: { inventory: "v1" },
      currentVersions: { inventory: "v2" },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "version_conflict");
  assert.equal(result.goldDelta, 0);
  assert.equal(result.gold, 10);
  assert.equal(result.audit.resultingBalance, 10);
});

test("transaction committer is idempotent for the same requestId", () => {
  const commit = memoryCommitter();
  const first = commit(write({ requestId: "req-tx-idmp001", goldDelta: 8, currentGold: 2 }));
  const second = commit(write({ requestId: "req-tx-idmp001", goldDelta: 8, currentGold: 2 }));
  assert.equal(first.ok, true);
  assert.equal(first.gold, 10);
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.gold, 10);
});

test("insufficient gold through the transaction boundary keeps structured codes", () => {
  const result = simulateCommit(write({ requestId: "req-tx-nsf0001", goldDelta: -9, currentGold: 3 }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "insufficient_gold");
  assert.equal(result.audit.code, "insufficient_gold");
  assert.equal(result.gold, 3);
});
