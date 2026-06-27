import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import AdmZip from "adm-zip";
import yaml from "js-yaml";

const currentDir = dirname(fileURLToPath(import.meta.url));

export type ConnectorManifest = {
  schema_version: 1;
  name: string;
  display_name: string;
  version: string;
  description?: string;
  runtime: {
    language: "python";
    entrypoint: string;
  };
  run_modes: {
    manual: boolean;
    scheduled: boolean;
  };
  schedule?: {
    minimum_interval_minutes?: number;
    recommended_interval_minutes?: number;
  };
  authentication: {
    modes: string[];
    unattended_supported: boolean;
  };
  inputs: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    default?: unknown;
  }>;
  secrets?: Array<{
    key: string;
    label: string;
    required: boolean;
  }>;
  output: {
    protocol: "podcast-hub-jsonl-v1";
    media_root: string;
  };
};

const requiredFiles = ["manifest.yaml", "src/connector.py", "requirements.lock", "README.md"];
const blockedNamePatterns = [
  /(^|\/)\.env$/i,
  /dockerfile$/i,
  /docker-compose\.ya?ml$/i,
  /(cookie|token|session|apikey|api_key|otp|password)/i
];
const blockedBinaryExtensions = [
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".class",
  ".jar",
  ".o",
  ".a",
  ".wasm"
];

function loadManifestSchema() {
  const schemaPath = resolve(currentDir, "../../../../connector-sdk/schemas/manifest.schema.json");
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

function normalizeEntryName(name: string): string {
  return name.replaceAll("\\", "/").replace(/^\.\//, "");
}

function checkPathSafety(entryName: string) {
  if (entryName.startsWith("/") || entryName.includes("../")) {
    throw new Error(`zip contains unsafe path: ${entryName}`);
  }
}

function hasBlockedName(entryName: string): boolean {
  return blockedNamePatterns.some((pattern) => pattern.test(entryName));
}

function hasBlockedBinaryExtension(entryName: string): boolean {
  const lower = entryName.toLowerCase();
  return blockedBinaryExtensions.some((ext) => lower.endsWith(ext));
}

function ensurePythonOnly(manifest: ConnectorManifest) {
  if (manifest.runtime.language !== "python") {
    throw new Error("v1 only supports python connectors");
  }
}

function validateManifestSchema(rawManifest: unknown): ConnectorManifest {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = loadManifestSchema();
  const validate = ajv.compile(schema);
  if (!validate(rawManifest)) {
    const errors = (validate.errors ?? []).map((item) => `${item.instancePath} ${item.message}`).join("; ");
    throw new Error(`manifest schema invalid: ${errors}`);
  }
  return rawManifest as ConnectorManifest;
}

export function validateConnectorZip(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error("zip is empty");
  }

  const fileNames = entries.filter((entry) => !entry.isDirectory).map((entry) => normalizeEntryName(entry.entryName));
  for (const name of fileNames) {
    checkPathSafety(name);
    if (hasBlockedName(name)) {
      throw new Error(`zip contains blocked file name: ${name}`);
    }
    if (hasBlockedBinaryExtension(name)) {
      throw new Error(`zip contains blocked binary file: ${name}`);
    }
  }

  for (const required of requiredFiles) {
    if (!fileNames.includes(required)) {
      throw new Error(`zip missing required file: ${required}`);
    }
  }

  const manifestEntry = zip.getEntry("manifest.yaml");
  if (!manifestEntry) {
    throw new Error("manifest.yaml not found");
  }

  const manifestRawText = zip.readAsText(manifestEntry);
  const parsed = yaml.load(manifestRawText);
  const manifest = validateManifestSchema(parsed);
  ensurePythonOnly(manifest);

  const checksum = createHash("sha256").update(buffer).digest("hex");

  return {
    manifest,
    checksum,
    sizeBytes: buffer.byteLength
  };
}
