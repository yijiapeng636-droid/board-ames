type WorkerMessage = { id: number }
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
let nextWorkerRequestId = 1

export function requestWorker<TRequest extends WorkerMessage, TResponse extends WorkerMessage>(
  workerUrl: URL,
  requestWithoutId: WithoutId<TRequest>,
  stage: string,
  signal?: AbortSignal,
): Promise<TResponse> {
  const worker = new Worker(workerUrl, { type: 'module' })
  const request = { ...requestWithoutId, id: nextWorkerRequestId++ } as unknown as TRequest
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      action()
    }
    const abort = () => finish(() => reject(new DOMException(`${stage}已取消`, 'AbortError')))

    if (signal?.aborted) {
      abort()
      return
    }

    signal?.addEventListener('abort', abort, { once: true })
    worker.addEventListener(
      'error',
      () => finish(() => reject(new Error(`${stage} Worker 执行失败`))),
      { once: true },
    )
    worker.addEventListener('message', (event: MessageEvent<TResponse>) => {
      if (event.data.id !== request.id) return
      finish(() => resolve(event.data))
    })

    try {
      worker.postMessage(JSON.parse(JSON.stringify(request)) as TRequest)
    } catch (error) {
      finish(() =>
        reject(
          new Error(
            `${stage}数据无法发送到 Worker：${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        ),
      )
    }
  })
}
