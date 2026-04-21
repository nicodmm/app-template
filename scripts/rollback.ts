import { readFileSync, existsSync } from "fs";
import postgres from "postgres";
import path from "path";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });

  const journalPath = path.join("drizzle", "migrations", "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    console.error("No migration journal found");
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  const entries: { tag: string }[] = journal.entries;
  if (entries.length === 0) {
    console.error("No migrations to roll back");
    process.exit(1);
  }

  const lastEntry = entries[entries.length - 1];
  const downPath = path.join("drizzle", "migrations", lastEntry.tag, "down.sql");

  if (!existsSync(downPath)) {
    console.error(`No down.sql found at ${downPath}`);
    process.exit(1);
  }

  const downSql = readFileSync(downPath, "utf-8");
  await client.unsafe(downSql);
  console.log(`Rolled back: ${lastEntry.tag}`);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
