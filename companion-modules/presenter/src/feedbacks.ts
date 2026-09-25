import type ModuleInstance from './main.js'
import { hexColor } from './state.js'

type NoOptions = Record<string, never>

export type FeedbacksSchema = {
	isBlack: { type: 'boolean'; options: NoOptions }
	textHidden: { type: 'boolean'; options: NoOptions }
	connected: { type: 'boolean'; options: NoOptions }
	itemIsLive: { type: 'boolean'; options: { index: number } }
	slideIsLive: { type: 'boolean'; options: { index: number } }
	sectionColor: { type: 'advanced'; options: { index: number } }
	isLiveMode: { type: 'boolean'; options: NoOptions }
	previewPending: { type: 'boolean'; options: NoOptions }
	layerHidden: { type: 'boolean'; options: { layer: string } }
	mediaPlaying: { type: 'boolean'; options: NoOptions }
	readiness: { type: 'advanced'; options: NoOptions }
	stageLayerHidden: { type: 'boolean'; options: { layer: string } }
	stageLayerPaused: { type: 'boolean'; options: { layer: string } }
	stageTimer: { type: 'advanced'; options: { layer: string } }
	masterSpeedChanged: { type: 'boolean'; options: NoOptions }
}

/** Presenter's "on air" red — the same meaning on the deck as in the app. */
export const LIVE_RED = 0xc0271d
export const AMBER = 0xb07a10
/** Healthy / ready / preview — green, as in the app. */
export const GREEN = 0x2e7d32
const WHITE = 0xffffff

export function UpdateFeedbacks(self: ModuleInstance): void {
	const state = () => self.client.getState()
	const indexOption = (label: string) => ({ id: 'index', type: 'number', label, default: 1, min: 1, max: 999 }) as const
	const layers = state().stageLayers
	const stageLayerOption = {
		id: 'layer',
		type: 'dropdown',
		label: 'Stage layer',
		default: layers[0] ? String(layers[0].id) : '',
		choices: layers.map((l) => ({ id: String(l.id), label: l.name })),
		allowCustom: true,
	} as const
	const stageLayer = (id: unknown) => state().stageLayers.find((l) => String(l.id) === String(id))

	self.setFeedbackDefinitions({
		isBlack: {
			name: 'Screens are black',
			type: 'boolean',
			defaultStyle: { bgcolor: LIVE_RED, color: WHITE },
			options: [],
			callback: () => state().isBlack,
		},
		textHidden: {
			name: 'Text is hidden',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [],
			callback: () => state().isTextHidden,
		},
		connected: {
			name: 'Connected to Presenter',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [],
			callback: () => self.client.isConnected(),
		},
		itemIsLive: {
			name: 'Agenda entry is live',
			type: 'boolean',
			defaultStyle: { bgcolor: LIVE_RED, color: WHITE },
			options: [indexOption('Entry (1 = first)')],
			callback: ({ options }) => state().itemIndex === Number(options.index) - 1,
		},
		slideIsLive: {
			name: 'Slide of the live entry is on screen',
			type: 'boolean',
			defaultStyle: { bgcolor: LIVE_RED, color: WHITE },
			options: [indexOption('Slide (1 = first)')],
			callback: ({ options }) => state().blockIndex === Number(options.index) - 1,
		},
		sectionColor: {
			name: 'Slide button in its section colour',
			description: 'Verse blue, chorus violet… as on Presenter’s slide cards. No colour for names it does not know.',
			type: 'advanced',
			affectedProperties: ['bgcolor'],
			options: [indexOption('Slide (1 = first)')],
			callback: ({ options }) => {
				const block = state().blocks[Number(options.index) - 1]
				return block?.color ? { bgcolor: hexColor(block.color, 0) } : {}
			},
		},
		isLiveMode: {
			name: 'Presenter is in Live mode',
			type: 'boolean',
			defaultStyle: { bgcolor: LIVE_RED, color: WHITE },
			options: [],
			callback: () => state().operatorMode === 'live',
		},
		previewPending: {
			name: 'A slide waits in the preview (Take)',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [],
			callback: () => state().previewPending,
		},
		layerHidden: {
			name: 'Layer is hidden',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [
				{
					id: 'layer',
					type: 'dropdown',
					label: 'Layer',
					default: 'background',
					choices: [
						{ id: 'background', label: 'Background' },
						{ id: 'media', label: 'Media' },
						{ id: 'stage', label: 'Stage overlays (all)' },
					],
				},
			],
			callback: ({ options }) => {
				const s = state()
				return options.layer === 'background' ? !s.videoVisible : options.layer === 'media' ? !s.mediaVisible : s.stageHidden
			},
		},
		mediaPlaying: {
			name: 'Media is playing',
			type: 'boolean',
			defaultStyle: { bgcolor: LIVE_RED, color: WHITE },
			options: [],
			callback: () => !!state().media?.playing,
		},
		readiness: {
			name: 'Ready for the service (green) or not (amber)',
			type: 'advanced',
			affectedProperties: ['bgcolor'],
			options: [],
			callback: () => ({ bgcolor: state().ready ? GREEN : AMBER }),
		},
		stageLayerHidden: {
			name: 'Stage layer is hidden',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [stageLayerOption],
			callback: ({ options }) => !!stageLayer(options.layer)?.hidden,
		},
		stageLayerPaused: {
			name: 'Stage layer is paused',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [stageLayerOption],
			callback: ({ options }) => !!stageLayer(options.layer)?.paused,
		},
		masterSpeedChanged: {
			name: 'Master speed is not normal',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [],
			callback: () => state().masterRate !== 1,
		},
		stageTimer: {
			name: 'Stage countdown in its warn / danger colour',
			description: 'Amber and red at the layer’s own warn and danger thresholds, as on the stage screen.',
			type: 'advanced',
			affectedProperties: ['bgcolor'],
			options: [stageLayerOption],
			callback: ({ options }) => {
				const layer = stageLayer(options.layer)
				const seconds = layer ? self.client.timerSeconds(layer) : null
				if (!layer?.timer || seconds === null || layer.timer.direction !== 'down') return {}
				if (layer.timer.dangerSec !== null && seconds <= layer.timer.dangerSec) return { bgcolor: LIVE_RED }
				if (layer.timer.warnSec !== null && seconds <= layer.timer.warnSec) return { bgcolor: AMBER }
				return {}
			},
		},
	})
}
