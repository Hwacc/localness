export interface AiTranslateStatus {
  enabled: boolean
  configured: boolean
  model: string
  quota: { limit: number | null; used: number; remaining: number | null }
  activeJobId: string | null
}

export type AiRunItemStatus = 'pending' | 'pass' | 'fixed' | 'fail' | 'error'

export interface AiRunItem {
  id: string
  keyId: number
  key: string
  locale: string
  reason: 'empty' | 'draft' | 'outdated'
  source: string
  status: AiRunItemStatus
  text: string | null
  original?: string
  issues?: Array<{ ruleId: string; message: string }>
  error?: string
  applied: boolean
}

export interface AiRunCounts {
  total: number
  done: number
  pass: number
  fixed: number
  fail: number
  error: number
}

export type AiRunState = 'idle' | 'starting' | 'running' | 'done' | 'cancelled'

export interface AiSingleDone {
  status: 'pass' | 'fixed' | 'fail'
  text: string
  original?: string
  issues?: Array<{ ruleId: string; message: string }>
  model: string
  batchId: string | null
}

const EMPTY_COUNTS: AiRunCounts = {
  total: 0,
  done: 0,
  pass: 0,
  fixed: 0,
  fail: 0,
  error: 0,
}

/** Whether AI pre-translation is on for the project, and what is left today. */
export function useAiTranslateStatus(
  projectId: Ref<ID>,
  /** The project's own switch: flipping it in settings must re-ask the server. */
  enabled?: Ref<boolean | undefined>
) {
  const status = ref<AiTranslateStatus | null>(null)

  async function refresh() {
    if (!validID(projectId.value)) {
      status.value = null
      return
    }
    try {
      status.value = await $fetch<AiTranslateStatus>(
        `/api/projects/${projectId.value}/ai/translate`
      )
    } catch {
      // Not being able to ask only hides the feature.
      status.value = null
    }
  }

  watch(enabled ? [projectId, enabled] : projectId, refresh, {
    immediate: true,
  })
  return { status, refresh }
}

/** One batch, from the request to the reviewer's decision. */
export function useAiTranslateRun(projectId: Ref<ID>) {
  const state = ref<AiRunState>('idle')
  const jobId = ref<string | null>(null)
  const items = ref<AiRunItem[]>([])
  const counts = ref<AiRunCounts>({ ...EMPTY_COUNTS })
  const capped = ref(0)
  const model = ref('')
  let source: EventSource | null = null

  const base = () => `/api/projects/${projectId.value}/ai/translate`

  function close() {
    source?.close()
    source = null
  }

  function upsert(item: AiRunItem) {
    const at = items.value.findIndex((one) => one.id === item.id)
    if (at === -1) items.value.push(item)
    else items.value[at] = { ...items.value[at], ...item }
  }

  function attach(id: string) {
    close()
    jobId.value = id
    state.value = 'running'
    items.value = []
    source = new EventSource(`${base()}/${id}`)
    source.addEventListener('item', (event) => {
      upsert(JSON.parse((event as MessageEvent<string>).data))
    })
    source.addEventListener('progress', (event) => {
      counts.value = JSON.parse((event as MessageEvent<string>).data)
    })
    source.addEventListener('done', (event) => {
      const data = JSON.parse((event as MessageEvent<string>).data)
      counts.value = data
      state.value = data.state
      // The server ends the stream; left open, EventSource would reconnect.
      close()
    })
  }

  async function start(body: {
    keyIds: number[]
    locales: string[]
    overwriteDraft: boolean
    includePublished: boolean
  }) {
    state.value = 'starting'
    try {
      const started = await useApi<{
        jobId: string
        model: string
        total: number
        capped: number
      }>(base(), { method: 'POST', body })
      capped.value = started.capped
      model.value = started.model
      counts.value = { ...EMPTY_COUNTS, total: started.total }
      attach(started.jobId)
    } catch (error) {
      state.value = 'idle'
      throw error
    }
  }

  async function cancel() {
    if (!jobId.value) return
    close()
    await useApi(`${base()}/${jobId.value}`, { method: 'DELETE' })
    state.value = 'cancelled'
  }

  async function retry() {
    if (!jobId.value) return
    await useApi(`${base()}/${jobId.value}/retry`, { method: 'POST' })
    attach(jobId.value)
  }

  async function apply(picks: Array<{ id: string; text: string }>) {
    const result = await useApi<{
      batchId: string
      applied: number
      skipped: { alreadyApplied: number; filled: number; quota: number }
    }>(`${base()}/${jobId.value}/apply`, {
      method: 'POST',
      body: { items: picks },
    })
    const done = new Set(picks.map((pick) => pick.id))
    items.value = items.value.map((item) =>
      done.has(item.id) ? { ...item, applied: true } : item
    )
    return result
  }

  async function revert(batchId: string) {
    return useApi<{ reverted: number; skipped: number }>(
      `${base()}/batches/${batchId}/revert`,
      { method: 'POST' }
    )
  }

  function reset() {
    close()
    state.value = 'idle'
    jobId.value = null
    items.value = []
    counts.value = { ...EMPTY_COUNTS }
    capped.value = 0
  }

  onScopeDispose(close)

  return {
    state,
    jobId,
    items,
    counts,
    capped,
    model,
    start,
    attach,
    cancel,
    retry,
    apply,
    revert,
    reset,
  }
}

/** `event:`/`data:` frames of a server-sent stream read with `fetch`. */
async function* readEventStream(
  response: Response
): AsyncGenerator<{ event: string; data: string }> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end = buffer.indexOf('\n\n')
    while (end !== -1) {
      const frame = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) yield { event, data: data.join('\n') }
      end = buffer.indexOf('\n\n')
    }
  }
}

/**
 * One cell, written out as the model produces it. `onToken` gets each piece;
 * the returned verdict says whether the server saved the text as a draft.
 */
export async function streamAiTranslateOne(
  projectId: ID,
  body: { keyId: number; locale: string; save?: boolean },
  handlers: { onToken: (text: string) => void; signal?: AbortSignal }
): Promise<AiSingleDone> {
  const response = await fetch(
    `/api/projects/${projectId}/ai/translate/single`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: handlers.signal,
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(
      error?.message || error?.statusMessage || 'AI translation failed'
    )
  }
  for await (const frame of readEventStream(response)) {
    const data = JSON.parse(frame.data)
    if (frame.event === 'token') handlers.onToken(data.text)
    else if (frame.event === 'done') return data as AiSingleDone
    else if (frame.event === 'error') throw new Error(data.message)
  }
  throw new Error('The stream ended without a result')
}

export interface AiCellResult {
  keyId: ID
  done: AiSingleDone
  /** Not saved yet: the reviewer has to accept it. */
  proposal: boolean
}

/**
 * AI translation of single cells (one language of one key), shared by every
 * place that edits a key's text. The caller owns where the text lives.
 *
 * A writable (draft) key saves at once and offers Undo; anything else is only
 * proposed until the reviewer accepts. Results are kept per language so that
 * starting one cell does not take another's actions away.
 */
export function useAiCell(opts: {
  projectId: Ref<ID>
  keyId: () => ID | null | undefined
  writable: () => boolean
  getText: (code: string) => string
  setText: (code: string, text: string) => void
  /** What the cell held before AI touched it; Discard and Undo put it back. */
  original: (code: string) => string
  /** The server wrote or reverted a draft, so the caller should read it back. */
  onChanged: () => void
}) {
  const toast = useToast()
  const run = ref<{ code: string; controller: AbortController } | null>(null)
  const results = ref<Record<string, AiCellResult>>({})

  function setResult(code: string, result: AiCellResult | null) {
    const { [code]: _dropped, ...rest } = results.value
    results.value = result ? { ...rest, [code]: result } : rest
  }

  /** A result belongs to the key it was made for; an answer can outlive the selection. */
  function resultFor(code: string) {
    const result = results.value[code]
    return result && String(result.keyId) === String(opts.keyId()) ? [result] : []
  }

  /** Whether the cell ended with a result, so a run over several can tell when to stop. */
  async function translate(
    code: string,
    controller = new AbortController()
  ): Promise<boolean> {
    const keyId = opts.keyId()
    if (!keyId || (run.value && run.value.controller !== controller)) return false
    const proposal = !opts.writable()
    run.value = { code, controller }
    setResult(code, null)
    opts.setText(code, '')
    try {
      const done = await streamAiTranslateOne(
        opts.projectId.value,
        { keyId: Number(keyId), locale: code, save: !proposal },
        {
          signal: controller.signal,
          onToken: (piece) => opts.setText(code, opts.getText(code) + piece),
        }
      )
      opts.setText(code, done.text)
      setResult(code, { keyId, done, proposal })
      // Saved server-side when it passed, so the caller reads it back.
      if (done.batchId) opts.onChanged()
      else if (!proposal)
        toast.add({
          title: 'The result broke a rule and was not saved',
          description: done.issues?.map((issue) => issue.message).join(' · '),
          color: 'warning',
          icon: 'i-lucide:triangle-alert',
        })
      return true
    } catch (error) {
      opts.setText(code, opts.original(code))
      if ((error as Error).name !== 'AbortError') {
        toast.add({
          title: 'AI translation failed',
          description: (error as Error).message,
          color: 'error',
          icon: 'i-lucide:circle-alert',
        })
      }
      return false
    } finally {
      run.value = null
    }
  }

  async function accept(code: string) {
    const result = results.value[code]
    if (!result?.proposal) return
    const accepted = await useApi<{ batchId: string }>(
      `/api/projects/${opts.projectId.value}/ai/translate/accept`,
      {
        method: 'POST',
        body: {
          keyId: Number(result.keyId),
          locale: code,
          text: opts.getText(code),
        },
      }
    )
    setResult(code, {
      ...result,
      proposal: false,
      done: { ...result.done, batchId: accepted.batchId },
    })
    opts.onChanged()
  }

  function discard(code: string) {
    opts.setText(code, opts.original(code))
    setResult(code, null)
  }

  async function undo(code: string) {
    const batchId = results.value[code]?.done.batchId
    if (!batchId) return
    await useApi(
      `/api/projects/${opts.projectId.value}/ai/translate/batches/${batchId}/revert`,
      { method: 'POST' }
    )
    setResult(code, null)
    opts.setText(code, opts.original(code))
    opts.onChanged()
  }

  function clear() {
    results.value = {}
  }

  return { run, results, translate, accept, discard, undo, resultFor, clear }
}