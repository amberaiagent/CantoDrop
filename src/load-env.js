// Side-effect module: load .env from the project root regardless of the current
// working directory. Import this FIRST (before config.js) so process.env is
// populated before any other module reads it.
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
