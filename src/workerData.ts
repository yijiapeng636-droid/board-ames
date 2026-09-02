export function postWorkerData<T>(worker: Worker, value: T, stage: string) {
  try {
    worker.postMessage(JSON.parse(JSON.stringify(value)) as T)
  } catch (error) {
    throw new Error(
      `${stage}数据无法发送到 Worker：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
