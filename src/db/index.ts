import { Database } from "bun:sqlite";

// Bun uses cwd here
export const db = new Database("./src/db/upload.db");
