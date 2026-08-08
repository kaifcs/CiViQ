// Backfills pairKey and creates the unique index without deleting or merging data.
// Stops on duplicate pairs so conflicting records can be resolved manually.
//
// Run once for databases created before pairKey existed:
// npm run migrate:conflict-pairkey

const dotenv = require("dotenv")
dotenv.config()

const mongoose = require("mongoose")
const { logger } = require("../utils/logger")
const Conflict = require("../models/Conflict")

const INDEX_NAME = "pairKey_1"

async function run() {
  if (!process.env.MONGODB_URI) {
    logger.fatal("MONGODB_URI is not set")
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  const collection = mongoose.connection.collection("conflicts")
  const rows = await collection
    .find(
      {},
      {
        projection: {
          project1: 1,
          project2: 1,
          pairKey: 1,
          status: 1,
          createdAt: 1,
        },
      }
    )
    .toArray()

  logger.info("Inspecting conflicts", {
    database: mongoose.connection.name,
    rows: rows.length,
    missingPairKey: rows.filter((r) => !r.pairKey).length,
  })

  // Group both project orders under the same canonical pair.
  const byPair = new Map()

  for (const row of rows) {
    const key = Conflict.pairKeyFor(row.project1, row.project2)

    if (!byPair.has(key)) byPair.set(key, [])
    byPair.get(key).push(row)
  }

  const duplicates = [...byPair.entries()].filter(([, group]) => group.length > 1)

  if (duplicates.length > 0) {
    logger.fatal("Duplicate conflict pairs found — resolve before migrating", {
      pairs: duplicates.map(([key, group]) => ({
        pair: key,
        rows: group.map((r) => ({
          id: String(r._id),
          status: r.status,
          createdAt: r.createdAt,
        })),
      })),
      hint: "Resolve duplicate rows, then re-run the migration.",
    })

    await mongoose.disconnect()
    process.exit(1)
  }

  // Only update rows whose derived key is missing or incorrect.
  const writes = []

  for (const [key, [row]] of byPair) {
    if (row.pairKey !== key) {
      writes.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { pairKey: key } },
        },
      })
    }
  }

  if (writes.length > 0) {
    const result = await collection.bulkWrite(writes)
    logger.info("Backfilled pairKey", { modified: result.modifiedCount })
  } else {
    logger.info("Every row already carries a pairKey; nothing to backfill")
  }

  const existing = await collection.indexes()

  if (existing.some((i) => i.name === INDEX_NAME && i.unique)) {
    logger.info("Unique pairKey index already present")
  } else {
    await collection.createIndex(
      { pairKey: 1 },
      { unique: true, name: INDEX_NAME }
    )
    logger.info("Created unique pairKey index", { name: INDEX_NAME })
  }

  logger.info("Migration complete", {
    rows: rows.length,
    distinctPairs: byPair.size,
  })

  await mongoose.disconnect()
}

run().catch(async (err) => {
  logger.fatal("Migration failed", {
    error: err.message,
    stack: err.stack,
  })

  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})