import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ENVIRONMENT_NAMES,
  ENVIRONMENT_PRESETS,
  dataResetAllowed,
  environmentFromRuntime,
  type EnvironmentConfig,
} from "../src/domain/environment";

const envDir = path.resolve(process.cwd(), "../infra/environments");

test("committed environment files match domain presets and stay distinct", () => {
  const names = ENVIRONMENT_NAMES.slice();
  const databases = new Set<string>();
  const volumes = new Set<string>();
  const secrets = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const file = JSON.parse(fs.readFileSync(path.join(envDir, name + ".json"), "utf8")) as EnvironmentConfig;
    const preset = ENVIRONMENT_PRESETS[name];
    assert.equal(file.name, preset.name);
    assert.equal(file.database.name, preset.database.name);
    assert.equal(file.database.volume, preset.database.volume);
    assert.equal(file.secretsFile, preset.secretsFile);
    assert.equal(file.contentVersion, preset.contentVersion);
    assert.equal(file.serverVersion, preset.serverVersion);
    assert.equal(file.logLevel, preset.logLevel);
    assert.equal(file.developmentToolsEnabled, preset.developmentToolsEnabled);
    assert.equal(file.deviceAuthEnabled, preset.deviceAuthEnabled);
    assert.equal(file.accountRegistration, preset.accountRegistration);
    assert.equal(file.dataReset, preset.dataReset);
    assert.equal(JSON.stringify(file).toLowerCase().indexOf("password"), -1);
    databases.add(file.database.name);
    volumes.add(file.database.volume);
    secrets.add(file.secretsFile);
  }
  assert.equal(databases.size, 4);
  assert.equal(volumes.size, 4);
  assert.equal(secrets.size, 4);
  assert.equal(dataResetAllowed(ENVIRONMENT_PRESETS.local), true);
  assert.equal(dataResetAllowed(ENVIRONMENT_PRESETS.automated_test), true);
  assert.equal(dataResetAllowed(ENVIRONMENT_PRESETS.staging), false);
  assert.equal(dataResetAllowed(ENVIRONMENT_PRESETS.production), false);
  assert.equal(ENVIRONMENT_PRESETS.production.accountRegistration, "closed");
  assert.equal(ENVIRONMENT_PRESETS.production.deviceAuthEnabled, false);
  assert.equal(ENVIRONMENT_PRESETS.production.developmentToolsEnabled, false);
});

test("runtime env overlays compiled defaults without reading secrets", () => {
  const production = environmentFromRuntime({ VIBECODE_ENV: "production" });
  assert.equal(production.name, "production");
  assert.equal(production.database.name, "nakama_production");
  assert.equal(production.logLevel, "WARN");
  const overlay = environmentFromRuntime({
    VIBECODE_ENV: "staging",
    VIBECODE_MIN_CLIENT_VERSION: "1.0.0",
    VIBECODE_MAX_CLIENT_VERSION: "1.1.0",
    VIBECODE_REGISTRATION: "closed",
  });
  assert.equal(overlay.name, "staging");
  assert.equal(overlay.maxClientVersion, "1.1.0");
  assert.equal(overlay.accountRegistration, "closed");
});
