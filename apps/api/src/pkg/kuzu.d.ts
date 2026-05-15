declare module 'kuzu' {
  export class Database {
    constructor(path: string, bufferPoolSize?: number)
  }
  export class Connection {
    constructor(db: Database)
    query(cypher: string): Promise<QueryResult>
    prepare(cypher: string): Promise<PreparedStatement>
    execute(stmt: PreparedStatement, params?: Record<string, unknown>): Promise<QueryResult>
  }
  export class QueryResult {
    getAll(): Promise<Record<string, unknown>[]>
    close(): void
  }
  export class PreparedStatement {}
  export const VERSION: string
  export const STORAGE_VERSION: number
}
