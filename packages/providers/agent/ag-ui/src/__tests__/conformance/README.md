# AG-UI conformance fixtures

`streams/` is the AG-UI protocol's own conformance corpus, copied verbatim from
[`spec/1.0/conformance/streams`](https://github.com/ag-ui-protocol/ag-ui/tree/751904a1/spec/1.0/conformance/streams)
at commit `751904a1` (MIT, see `LICENSE` in this folder). Each fixture is one event stream and the
outcome the specification requires of a client that consumes it; `../conformance.test.ts` replays every
one of them through `createAgUiRunner`.

The corpus was written for the protocol's first-party clients, which hold the run's messages and state
themselves. A runner hands aparté run events to `AparteClient` instead, so the harness translates: it
rebuilds the messages from those events, reads the state from the next request, and says, per key and
per fixture, what a runner cannot observe and why. Nothing is skipped silently.

To refresh: copy the folder from a newer commit, regenerate `MANIFEST.txt`
(`ls streams/*.json | xargs -n1 basename | sort`), update the commit above, and run
`pnpm -C packages/providers/agent/ag-ui exec vitest run src/__tests__/conformance.test.ts`.
