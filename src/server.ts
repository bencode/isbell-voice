// Voice input for Isbell: a recording in, its transcript and the transcript tidied out. Reached only
// through the host's reverse proxy (isbell.fmap.dev/voice), so it needs no CORS. No auth, and loose
// limits: 20 recordings a minute and 60 minutes a day for each client; a recording is five minutes
// and 10 MB at most.

import { serve } from '@hono/node-server'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { rateLimiter } from 'hono-rate-limiter'
import { AudioError, MAX_SECONDS, toMp3 } from './audio.ts'
import { polish, transcribe } from './dashscope.ts'
import { DAILY_SECONDS, take } from './quota.ts'

// Five minutes recorded as a browser does, aac on Safari at the most, stay under this.
const MAX_BYTES = 10 * 1024 * 1024

const app = new Hono()

// The client, as the reverse proxy saw it.
const client = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

app.get('/healthz', c => c.text('ok'))

app.post(
  '/v1/transcribe',
  // Loose: far more than anyone speaks, only a stop for a client gone wrong. In memory, so a restart
  // forgets it.
  rateLimiter({
    windowMs: 60_000,
    limit: 20,
    keyGenerator: client,
    standardHeaders: 'draft-7',
    message: { error: 'too many recordings, wait a minute' },
  }),
  bodyLimit({ maxSize: MAX_BYTES, onError: c => c.json({ error: 'the recording is over 10 MB' }, 413) }),
  async c => {
    const { audio } = await c.req.parseBody()
    if (!(audio instanceof File)) return c.json({ error: 'no audio' }, 400)
    const { mp3, seconds } = await toMp3(new Uint8Array(await audio.arrayBuffer()))
    if (seconds > MAX_SECONDS)
      return c.json({ error: `the recording is over ${MAX_SECONDS / 60} minutes` }, 413)
    const spent = take(client(c), seconds)
    if (spent) {
      c.header('Retry-After', String(spent.retryAfter))
      return c.json({ error: `today's ${DAILY_SECONDS / 60} minutes are used up` }, 429)
    }
    const raw = await transcribe(mp3)
    // Silence is heard as nothing, and there is nothing to tidy.
    const polished = raw ? await polish(raw) : ''
    return c.json({ raw, polished })
  },
)

app.onError((err, c) => {
  console.error(err)
  if (err instanceof HTTPException) return err.getResponse()
  if (err instanceof AudioError) return c.json({ error: 'the recording could not be read' }, 400)
  return c.json({ error: err.message }, 502)
})

const port = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port }, () => console.log(`voice on :${port}`))
