declare module 'pg-cursor' {
  import { QueryConfig, Submittable } from 'pg'

  class Cursor implements Submittable {
    constructor(text: string, values?: any[])
    constructor(config: QueryConfig)

    read(rowCount: number, callback: (err: Error | undefined, rows: any[]) => void): void
    close(callback: () => void): void
    submit(connection: any): void
  }

  export = Cursor
}
