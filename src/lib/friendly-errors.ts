// Convierte los fallos técnicos de los proveedores en un mensaje claro para el usuario.
// El detalle (proveedor, modelo, código) va a los registros del servidor, no al chat.

export function friendlyFailure(errors: string[]): string {
  const text = errors.join("\n");
  if (/\[429/.test(text)) {
    return "La IA gratuita se quedó sin cupo por ahora. Probá de nuevo más tarde.";
  }
  if (/\[(500|502|503|504)\b|no respondió/.test(text)) {
    return "La IA está muy ocupada en este momento. Probá de nuevo en unos segundos.";
  }
  return "No pude completar el pedido. Probá de nuevo; si vuelve a pasar, avisame.";
}

export function logFailure(scope: string, errors: string[]) {
  console.error(`[forja:${scope}] todos los proveedores fallaron`, errors);
}
