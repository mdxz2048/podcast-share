import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, "../src/db/migrations/001_init.sql");
const sql = readFileSync(sqlPath, "utf8");

async function main() {
  await pool.query(sql);
  console.log("migration applied");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
