/** Bound background work across callers. A rejected task must always release its slot. */
export function createTaskQueue(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
  let active = 0;
  const waiting: Array<() => void> = [];
  const drain = () => {
    while (active < concurrency && waiting.length) waiting.shift()!();
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      waiting.push(() => {
        active++;
        void Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            drain();
          });
      });
      drain();
    });
}

/** Shared by show loading and revision checks so a large agenda cannot flood the API. */
export const queueSongFetch = createTaskQueue(4);
