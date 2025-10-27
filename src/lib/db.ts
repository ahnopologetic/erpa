import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/dist/vector'

let dbInstance
// Implement a singleton pattern to make sure we only create one database instance.
export async function getDB() {
    if (dbInstance) {
        return dbInstance
    }
    const metaDb = new PGlite('idb://erpa-semantic-search', {
        extensions: {
            vector,
        },
    })
    await metaDb.waitReady
    dbInstance = metaDb
    return metaDb
}

// Initialize the database schema.
export const initSchema = async (db) => {
    return await db.exec(`
    create extension if not exists vector;
    
    -- Cache table for storing page-level embeddings and data
    create table if not exists cached_pages (
      url text primary key,
      page_data jsonb not null,
      created_at timestamp default now()
    );
  `)
}

// Helper method to count the rows in a table.
export const countRows = async (db, table) => {
    const res = await db.query(`SELECT COUNT(*) FROM ${table};`)
    return res.rows[0].count
}

// [...]