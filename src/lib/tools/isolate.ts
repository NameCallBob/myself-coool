/**
 * Runs one pure function in a throwaway Worker with a hard deadline.
 *
 * This exists for the regex tester. A pattern like `(a+)+$` against a
 * non-matching string backtracks for longer than anyone will wait, and on the
 * main thread that is indistinguishable from the browser hanging — the tab
 * stops painting and the only way out is to close it. In a Worker the runaway
 * is terminable, so a timeout turns a hang into an error message.
 *
 * The worker body is a static string in this file, never anything the user
 * typed: patterns and inputs cross as structured-cloned data.
 */

export type IsolateResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function isolate<T>(
  /** Worker body. Must call `postMessage(result)` in an `onmessage` handler. */
  body: string,
  payload: unknown,
  timeoutMs = 2000
): Promise<IsolateResult<T>> {
  let url: string | undefined;
  let worker: Worker | undefined;
  try {
    url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const active = worker;
  const objectUrl = url;

  return new Promise<IsolateResult<T>>((resolve) => {
    let settled = false;
    const finish = (result: IsolateResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active.terminate();
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `timeout after ${timeoutMs}ms` }),
      timeoutMs
    );

    active.onmessage = (event: MessageEvent) => {
      const data = event.data as { error?: string; value?: T };
      if (data && typeof data.error === 'string') finish({ ok: false, error: data.error });
      else finish({ ok: true, value: data?.value as T });
    };
    active.onerror = (event) => finish({ ok: false, error: event.message || 'worker failed' });

    active.postMessage(payload);
  });
}
