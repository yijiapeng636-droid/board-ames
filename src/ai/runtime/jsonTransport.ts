export async function postJson(
  endpoint: string,
  payload: unknown,
  fallbackError: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  const data: unknown = await response.json().catch(() => null)
  if (response.ok) return data
  const message =
    data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : `${fallbackError}（HTTP ${response.status}）`
  throw new Error(message)
}
