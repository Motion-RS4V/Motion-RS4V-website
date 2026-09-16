import "server-only";

import { cache } from "react";
import { db } from "@/server/db";
import { loadSettings } from "./loader";

/**
 * Settings for the current request, read once however many components ask.
 * For pages only; services and transactions keep calling loadSettings with their own client.
 */
export const requestSettings = cache(() => loadSettings(db));
