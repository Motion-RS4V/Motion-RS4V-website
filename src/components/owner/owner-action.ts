export type Stranded = { reference: string; date: string; time: string };

export class OwnerActionError extends Error {
  constructor(
    message: string,
    readonly stranded: Stranded[] = [],
  ) {
    super(message);
  }
}

/** Posts one owner action. Throws OwnerActionError with the server's message when it's refused. */
export async function ownerAction<T = unknown>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/owner/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new OwnerActionError("Couldn't reach the server. Check the connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new OwnerActionError(json.error ?? "That didn't work. Try again.", json.stranded ?? []);
  return json as T;
}
