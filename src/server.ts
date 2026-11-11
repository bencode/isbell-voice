// Voice input for Isbell: a recording in, its transcript and the transcript tidied out. Reached only
// through the host's reverse proxy (isbell.fmap.dev/voice), so it needs no CORS. No auth, and a
// loose rate limit; a recording is five minutes and 10 MB at most.

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { rateLimiter } from 'hono-rate-limiter'
import { AudioError, MAX_SECONDS, toMp3 } from './audio.ts'
import { polish, transcribe } from './dashscope.ts'

// Five minutes recorded as a browser does, aac on Safari at the most, stay under this.
const MAX_BYTES = 10 * 1024 * 1024

const app = new Hono()

app.get('/healthz', c => c.text('ok'))

app.post(
  '/v1/transcribe',
  // Loose: far more than anyone speaks, only a stop for a client gone wrong. In memory, so a restart
  // forgets it.
  rateLimiter({
    windowMs: 60_000,
    limit: 20,
    // The client, as the reverse proxy saw it.
    keyGenerator: c => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local',
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
