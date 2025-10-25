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
    -- drop table if exists embeddings; -- Uncomment this line to reset the database
    create table if not exists embeddings (
      id bigint primary key generated always as identity,
      content text not null,
      embedding vector (384)
    );
    
    create index on embeddings using hnsw (embedding vector_ip_ops);
    
    -- Cache table for storing page-level embeddings
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