// The two DashScope calls: speech to text, and tidying the text.

import { POLISH_PROMPT } from './prompt.ts'

const BASE = process.env.DASHSCOPE_BASE ?? 'https://token-plan.cn-beijing.maas.aliyuncs.com'
const KEY = process.env.DASHSCOPE_API_KEY
if (!KEY) throw new Error('DASHSCOPE_API_KEY is not set')

/** DashScope answered with an error, or with nothing usable. */
export class UpstreamError extends Error {}

type AsrReply = { output?: { text?: string } }
type ChatReply = { choices?: { message?: { content?: string } }[] }

export async function transcribe(mp3: Buffer): Promise<string> {
  const reply = await post<AsrReply>('/api/v1/services/aigc/multimodal-generation/generation', {
    model: 'qwen-audio-3.0-asr-flash',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: `data:audio/mpeg;base64,${mp3.toString('base64')}` },
            },
          ],
        },
      ],
    },
    parameters: { format: 'mp3', sample_rate: '16000', language_hints: ['zh', 'en'] },
  })
  const text = reply.output?.text
  if (text === undefined) throw new UpstreamError('the ASR reply has no output.text')
  return text.trim()
}

export async function polish(raw: string): Promise<string> {
  const reply = await post<ChatReply>('/compatible-mode/v1/chat/completions', {
    model: 'qwen3.8-flash',
    enable_thinking: false,
    temperature: 0.2,
    messages: [
      { role: 'system', content: POLISH_PROMPT },
      { role: 'user', content: `<transcript>${raw}</transcript>` },
    ],
  })
  const text = reply.choices?.[0]?.message?.content?.trim()
  if (!text) throw new UpstreamError('the polish reply has no content')
  return text
}

// Five minutes of speech take a while to hear, and their transcript a while to tidy.
const TIMEOUT_MS = 180_000

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new UpstreamError(`${path} ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}
