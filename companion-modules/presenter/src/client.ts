import WebSocket from 'ws'
import { emptyState, type PresenterState, type StageLayer } from './state.js'

export type ClientStatus =
	| { state: 'connecting' }
	| { state: 'connected' }
	| { state: 'error'; message: string }
	| { state: 'disconnected' }

interface Handlers {
	onState: (state: PresenterState) => void
	onStatus: (status: ClientStatus) => void
	onLog: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
}

/**
 * The Presenter end: the desktop app's built-in WebSocket server (src/main/wsServer.ts).
 *
 * Commands are `{ id, action, target?, payload? }`, answered by `{ type: 'response', id,
 * success, error? }`. State arrives as `{ type: 'broadcast', action: 'state_update', data }`
 * after every change, and once right after connecting.
 */
export class PresenterClient {
	private socket?: WebSocket
	private reconnectTimer?: NodeJS.Timeout
	private closing = false
	private state: PresenterState = emptyState()
	private commandId = 0
	/** Presenter's clock minus ours, ms — timer anchors are in Presenter's clock. */
	private clockOffsetMs = 0
	/** Our clock when the last state arrived — media positions are extrapolated from it. */
	private receivedAt = 0
	private readonly pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

	constructor(private readonly handlers: Handlers) {}

	getState(): PresenterState {
		return this.state
	}

	/** A stage layer's timer now, in seconds (remaining for a countdown), or null without one. */
	timerSeconds(layer: StageLayer): number | null {
		const t = layer.timer
		if (!t) return null
		const now = t.frozenAt ?? Date.now() + this.clockOffsetMs
		const seconds = (t.direction === 'down' ? t.anchor - now : now - t.anchor) / 1000
		// Count down in whole seconds the way a stage clock does: 0:01 until it really is zero.
		const shown = t.direction === 'down' ? Math.ceil(seconds) : Math.floor(seconds)
		return t.clampAtZero ? Math.max(0, shown) : shown
	}

	/** The focused media entry's position now, in seconds. */
	mediaElapsed(): number {
		const m = this.state.media
		if (!m) return 0
		// Media time advances at the playing speed.
		const elapsed = m.time + (m.playing ? ((Date.now() - this.receivedAt) / 1000) * (m.rate ?? 1) : 0)
		return m.duration > 0 ? Math.min(elapsed, m.duration) : elapsed
	}

	/** Whether any clock a button shows is moving right now. */
	isTicking(): boolean {
		return !!this.state.media?.playing || this.state.stageLayers.some((l) => l.timer && l.timer.frozenAt === null && !l.hidden)
	}

	isConnected(): boolean {
		return this.socket?.readyState === WebSocket.OPEN
	}

	connect(host: string, port: number): void {
		this.disconnect()
		this.closing = false

		const url = `ws://${host}:${port}`
		this.handlers.onStatus({ state: 'connecting' })
		this.handlers.onLog('debug', `Connecting to ${url}`)

		let socket: WebSocket
		try {
			socket = new WebSocket(url)
		} catch (e) {
			this.handlers.onStatus({ state: 'error', message: `Invalid address: ${(e as Error).message}` })
			return
		}
		this.socket = socket

		socket.on('open', () => {
			this.handlers.onStatus({ state: 'connected' })
			// A Presenter from before the server pushed its state on connect answers this instead.
			void this.send('get_state').catch(() => undefined)
		})
		socket.on('message', (raw: Buffer) => this.onMessage(raw.toString()))
		socket.on('error', (e: Error) => {
			this.handlers.onLog('debug', `Socket error: ${e.message}`)
			this.handlers.onStatus({ state: 'error', message: e.message })
		})
		socket.on('close', () => {
			if (this.closing) return
			this.handlers.onStatus({ state: 'disconnected' })
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = setTimeout(() => this.connect(host, port), 3000)
		})
	}

	disconnect(): void {
		this.closing = true
		clearTimeout(this.reconnectTimer)
		this.reconnectTimer = undefined
		this.pending.forEach(({ reject, timer }) => {
			clearTimeout(timer)
			reject(new Error('Disconnected'))
		})
		this.pending.clear()
		if (this.socket) {
			this.socket.removeAllListeners()
			try {
				this.socket.close()
			} catch {
				/* already gone */
			}
			this.socket = undefined
		}
	}

	/** Send a command and resolve once Presenter accepts it. */
	async send(action: string, payload?: Record<string, unknown>, target?: string): Promise<void> {
		if (!this.isConnected()) throw new Error('Not connected to Presenter')
		const id = `companion-${++this.commandId}`
		this.socket!.send(JSON.stringify({ id, action, ...(target ? { target } : {}), ...(payload ? { payload } : {}) }))
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(new Error(`"${action}" was not answered`))
			}, 5000)
			this.pending.set(id, { resolve, reject, timer })
		})
	}

	private onMessage(raw: string): void {
		let msg: Record<string, any>
		try {
			msg = JSON.parse(raw)
		} catch {
			return
		}

		// `get_state` answers with the state as its data, so both shapes feed the same path.
		const isState =
			msg.action === 'state_update' || (msg.type === 'response' && msg.action === 'get_state' && msg.success)
		if (isState && msg.data && typeof msg.data === 'object') {
			this.state = { ...emptyState(), ...msg.data }
			this.receivedAt = Date.now()
			if (this.state.sentAt) this.clockOffsetMs = this.state.sentAt - this.receivedAt
			this.handlers.onState(this.state)
		}

		if (msg.type === 'response' && typeof msg.id === 'string') {
			const entry = this.pending.get(msg.id)
			if (!entry) return
			clearTimeout(entry.timer)
			this.pending.delete(msg.id)
			if (msg.success) entry.resolve()
			else entry.reject(new Error(msg.error ?? 'Command failed'))
		}
	}
}
