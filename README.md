# isbell-voice

Voice input for [Isbell](https://github.com/bencode/Isbell). Each request is one recording. The service turns it into text with DashScope's `qwen-audio-3.0-asr-flash`, tidies the text with `qwen3.8-flash`, and the result goes into Isbell's message box.

Isbell's web app shows its mic button only when it is built with `VITE_VOICE_URL`. The service has no auth for now. Its rate limit is loose: 20 recordings per minute per client, kept in memory. A recording can be at most 5 minutes long and at most 10 MB.

## Contract

```http
POST /v1/transcribe
Content-Type: multipart/form-data   (audio=<any recording a browser makes>)
```

```ts
type VoiceResult = { raw: string; polished: string } // 200
type VoiceError = { error: string } // 400 413 429 502
```

| Status | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| 400    | No audio, or audio that can't be read                                             |
| 413    | Over 5 minutes, or over 10 MB                                                     |
| 429    | Over 20 a minute. The response carries `Retry-After`                              |
| 502    | DashScope failed or took over 3 minutes. The response carries DashScope's message |

## Run locally

```sh
cp .env.example .env   # fill in DASHSCOPE_API_KEY; .env is never committed
pnpm install
pnpm start             # :8080, needs ffmpeg on the PATH
curl -F audio=@sample.webm localhost:8080/v1/transcribe
```

## Deploy

The service is deployed on skylab's `i`, in `/root/repos/isbell-voice`.
1. Write `.env` by hand on the server.
2. Run `docker compose up -d --build`.

The container listens on `172.17.0.1:5803`, the Docker bridge only. Caddy routes `isbell.fmap.dev/voice/*` to it, using `handle_path` so the `/voice` prefix is stripped.
