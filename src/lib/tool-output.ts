// Recorte de salidas de herramientas. Mantiene el inicio y el final y avisa cuánto se omitió,
// en vez de cortar en silencio (idea tomada de OpenCode, MIT).

export function truncateToolOutput(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.ceil(max * 0.7);
  const tail = max - head;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n… [salida recortada: se omitieron ${omitted} caracteres del medio] …\n${text.slice(text.length - tail)}`;
}
