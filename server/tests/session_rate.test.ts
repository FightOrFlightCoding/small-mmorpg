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
  CHARACTER_CREATE_RATE_MAX,
  CHARACTER_CREATE_RATE_WINDOW_MS,
  CHARACTER_NAME_RATE_MAX,
  CHARACTER_SELECT_RATE_MAX,
  resetSessionRates,
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

test("character create, name, and select windows are independent and do not lock accounts", () => {
  resetSessionRates();
  const now = 2_200_000_000_000;
  const user = "character-rate-user";
  for (let i = 0; i < CHARACTER_CREATE_RATE_MAX; i++) {
    assert.equal(consumeSessionRate("character_create", user, now), true);
  }
  assert.equal(consumeSessionRate("character_create", user, now + 10), false);
  assert.equal(consumeSessionRate("character_name", user, now), true);
  assert.equal(consumeSessionRate("character_select", user, now), true);
  for (let i = 1; i < CHARACTER_NAME_RATE_MAX; i++) {
    assert.equal(consumeSessionRate("character_name", user, now), true);
  }
  assert.equal(consumeSessionRate("character_name", user, now + 10), false);
  for (let i = 1; i < CHARACTER_SELECT_RATE_MAX; i++) {
    assert.equal(consumeSessionRate("character_select", user, now), true);
  }
  assert.equal(consumeSessionRate("character_select", user, now + 10), false);
  assert.equal(consumeSessionRate("character_create", user, now + CHARACTER_CREATE_RATE_WINDOW_MS), true);
});
