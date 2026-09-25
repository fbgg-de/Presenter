import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, buildVariableValues, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { PresenterClient, type ClientStatus } from './client.js'
import type { PresenterState } from './state.js'

const ALL_FEEDBACKS = [
	'isBlack',
	'textHidden',
	'connected',
	'itemIsLive',
	'slideIsLive',
	'sectionColor',
	'isLiveMode',
	'previewPending',
	'layerHidden',
	'mediaPlaying',
	'readiness',
	'stageLayerHidden',
	'stageLayerPaused',
	'stageTimer',
	'masterSpeedChanged',
] as const

/** How often running clocks (stage timers, media time) are redrawn between Presenter's updates. */
const TICK_MS = 500

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
	compositeElements: undefined
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	client!: PresenterClient

	/** The agenda titles the "Go to agenda entry" dropdown was last built from. */
	private itemsKey = ''
	/** The stage layers the stage dropdowns, variables and presets were last built from. */
	private layersKey = ''
	private ticker?: NodeJS.Timeout

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.client = new PresenterClient({
			onState: (state) => this.onState(state),
			onStatus: (status) => this.onStatus(status),
			onLog: (level, message) => this.log(level, message),
		})

		UpdateVariableDefinitions(this)
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)

		this.updateStatus(InstanceStatus.Connecting)
		this.connect()
	}

	async destroy(): Promise<void> {
		clearInterval(this.ticker)
		this.client?.disconnect()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private connect(): void {
		this.client.connect(this.config.host || '127.0.0.1', this.config.port || 9001)
	}

	private onStatus(status: ClientStatus): void {
		if (status.state === 'connected') this.updateStatus(InstanceStatus.Ok)
		else if (status.state === 'connecting') this.updateStatus(InstanceStatus.Connecting)
		else if (status.state === 'error') this.updateStatus(InstanceStatus.ConnectionFailure, status.message)
		else this.updateStatus(InstanceStatus.Disconnected)
		this.publish()
	}

	private onState(state: PresenterState): void {
		// Only dropdowns, stage variables and stage presets depend on these lists; everything else
		// is variables and feedbacks.
		const key = state.items.map((item) => item.title).join('\n')
		const layersKey = state.stageLayers.map((l) => `${l.id}:${l.name}`).join('\n')
		if (layersKey !== this.layersKey) {
			this.layersKey = layersKey
			this.itemsKey = key
			UpdateVariableDefinitions(this)
			UpdateActions(this)
			UpdateFeedbacks(this)
			UpdatePresets(this)
		} else if (key !== this.itemsKey) {
			this.itemsKey = key
			UpdateActions(this)
		}
		this.publish()
		this.syncTicker()
	}

	/**
	 * Count running clocks locally, only while one runs: Presenter sends a clock's anchor once,
	 * not every second, and an idle deck should not redraw twice a second.
	 */
	private syncTicker(): void {
		const ticking = this.client.isTicking()
		if (ticking && !this.ticker) {
			this.ticker = setInterval(() => {
				this.setVariableValues(buildVariableValues(this))
				this.checkFeedbacks('stageTimer')
			}, TICK_MS)
		} else if (!ticking && this.ticker) {
			clearInterval(this.ticker)
			this.ticker = undefined
			// One last frame, so a clock lands where it stopped rather than a tick earlier.
			this.setVariableValues(buildVariableValues(this))
		}
	}

	private publish(): void {
		this.setVariableValues(buildVariableValues(this))
		this.checkFeedbacks(...ALL_FEEDBACKS)
	}
}
