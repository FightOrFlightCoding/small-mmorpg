import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_RATE_MAX,
  AUTH_RATE_WINDOW_MS,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  PARTY_RPC_RATE_MAX,
  PARTY_RPC_RATE_WINDOW_MS,
  consumeSessionRate,
} from "../src/domain/rate_limit";

test("session auth, chat, and party windows are independent", () => {
  const now = 2_100_000_000_000;
  const authKey = "email:session-rate@example.test";
  const chatKey = "session-rate-chat";
  const partyKey = "session-rate-party";
  for (let i = 0; i < AUTH_RATE_MAX; i++) {
    assert.equal(consumeSessionRate("auth", authKey, now), true);
  }
  assert.equal(consumeSessionRate("auth", authKey, now + 10), false);
  assert.equal(consumeSessionRate("auth", "email:session-rate-other@example.test", now), true);
  assert.equal(consumeSessionRate("auth", authKey, now + AUTH_RATE_WINDOW_MS), true);
  for (let i = 0; i < CHAT_RATE_MAX; i++) {
    assert.equal(consumeSessionRate("chat", chatKey, now), true);
  }
  assert.equal(consumeSessionRate("chat", chatKey, now + 50), false);
  assert.equal(consumeSessionRate("chat", chatKey + "-b", now), true);
  assert.equal(consumeSessionRate("chat", chatKey, now + CHAT_RATE_WINDOW_MS), true);
  for (let i = 0; i < PARTY_RPC_RATE_MAX; i++) {
    assert.equal(consumeSessionRate("party", partyKey, now), true);
  }
  assert.equal(consumeSessionRate("party", partyKey, now + 50), false);
  assert.equal(consumeSessionRate("party", partyKey, now + PARTY_RPC_RATE_WINDOW_MS), true);
});
