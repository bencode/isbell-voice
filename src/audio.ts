// A browser's recording, in whatever it records (webm/opus, mp4/aac, …), as the mp3 the ASR reads.

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The ASR takes five minutes at most. */
export const MAX_SECONDS = 300

const MP3 = '-ac 1 -ar 16000 -b:a 32k'.split(' ')
const DURATION = '-v error -show_entries format=duration -of csv=p=0'.split(' ')

/** The recording could not be read as audio. */
export class AudioError extends Error {}

/** 16 kHz mono mp3, small enough that five minutes stay well under the ASR's 10 MB, and how long it
 * is. The recording goes through a file: an mp4 may keep its index at the end, which ffmpeg cannot
 * reach on a pipe. */
export async function toMp3(audio: Uint8Array): Promise<{ mp3: Buffer; seconds: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'voice-'))
  try {
    const [input, output] = [join(dir, 'input'), join(dir, 'output.mp3')]
    await writeFile(input, audio)
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input, ...MP3, output])
    const duration = await run('ffprobe', [...DURATION, output])
    return { mp3: await readFile(output), seconds: Number(duration.toString().trim()) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function run(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new AudioError(Buffer.concat(err).toString().trim() || `${command} exited with ${code}`))
    })
  })
}
