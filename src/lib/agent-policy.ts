export type AutonomyMode = "assisted" | "unattended";

export const AUTONOMY_STORAGE_KEY = "forja.autonomy.v1";

export function loadAutonomyMode(storage?: Pick<Storage, "getItem">): AutonomyMode {
  const value = storage?.getItem(AUTONOMY_STORAGE_KEY);
  return value === "unattended" ? "unattended" : "assisted";
}

export function saveAutonomyMode(
  storage: Pick<Storage, "setItem"> | undefined,
  mode: AutonomyMode,
) {
  storage?.setItem(AUTONOMY_STORAGE_KEY, mode);
}
