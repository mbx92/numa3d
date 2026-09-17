import { desc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { syncLibraryFilesFromMinio } from '../../utils/libraryFiles.js'

export default defineEventHandler(async () => {
  const db = useDb()
  await syncLibraryFilesFromMinio(db)
  return db.select().from(schema.libraryFiles).orderBy(desc(schema.libraryFiles.createdAt))
})
