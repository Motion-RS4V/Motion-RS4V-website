/**
 * Side-effect import for standalone scripts (seed, checks). Import it FIRST:
 * ES imports run before the importing file's own code, so a `config()` call
 * placed below other imports would run too late.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
