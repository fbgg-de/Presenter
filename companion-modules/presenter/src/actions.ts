import type { DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'

type NoOptions = { options: Record<string, never> }

export type ActionsSchema = {
	nextSlide: NoOptions
	prevSlide: NoOptions
	nextItem: NoOptions
	prevItem: NoOptions
	nextLine: NoOptions
	prevLine: NoOptions
	goItem: { options: { index: string } }
	goSlide: { options: { index: number } }
	black: { options: { mode: string } }
	text: { options: { mode: string } }
	video: { options: { command: string } }
	videoSeek: { options: { seconds: number } }
	videoSpeed: { options: { rate: string } }
	masterSpeedSet: { options: { rate: number } }
	masterSpeedStep: { options: { step: number } }
	masterSpeedReset: NoOptions
	identifyWindows: NoOptions
	take: NoOptions
	mode: { options: { mode: string } }
	layer: { options: { layer: string } }
	stage: { options: { layer: string; command: string } }
}

const MODE_CHOICES: DropdownChoice[] = [
	{ id: 'toggle', label: 'Toggle' },
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
]

export function UpdateActions(self: ModuleInstance): void {
	const state = self.client.getState()
	const layerChoices: DropdownChoice[] = state.stageLayers.map((layer) => ({ id: String(layer.id), label: layer.name }))

	// The point of the module over a generic websocket: pick an entry by name, not by index.
	const itemChoices: DropdownChoice[] = state.items.map((item, i) => ({ id: String(i + 1), label: `${i + 1}. ${item.title}` }))

	const run = async (action: string, payload?: Record<string, unknown>): Promise<void> => {
		try {
			await self.client.send(action, payload)
		} catch (e) {
			self.log('error', `${action} failed: ${(e as Error).message}`)
		}
	}
	const simple = (name: string, action: string) => ({ name, options: [], callback: async () => run(action) })

	self.setActionDefinitions({
		nextSlide: simple('Next slide', 'next_block'),
		prevSlide: simple('Previous slide', 'prev_block'),
		nextItem: simple('Next agenda entry', 'next_item'),
		prevItem: simple('Previous agenda entry', 'prev_item'),
		nextLine: simple('Next line (stream mode)', 'next_line'),
		prevLine: simple('Previous line (stream mode)', 'prev_line'),

		goItem: {
			name: 'Go to agenda entry',
			options: [
				{
					id: 'index',
					type: 'dropdown',
					label: 'Entry',
					default: itemChoices[0]?.id ?? '1',
					choices: itemChoices,
					allowCustom: true,
					tooltip: 'A custom value is the entry number, 1 = first.',
				},
			],
			callback: async ({ options }) => run('set_item', { index: Number(options.index) - 1 }),
		},

		goSlide: {
			name: 'Go to slide of the live entry',
			options: [{ id: 'index', type: 'number', label: 'Slide (1 = first)', default: 1, min: 1, max: 99 }],
			callback: async ({ options }) => run('set_block', { index: Number(options.index) - 1 }),
		},

		black: {
			name: 'Black',
			options: [{ id: 'mode', type: 'dropdown', label: 'Black', default: 'toggle', choices: MODE_CHOICES }],
			callback: async ({ options }) =>
				run(options.mode === 'on' ? 'fade_to_black' : options.mode === 'off' ? 'fade_from_black' : 'toggle_black'),
		},

		text: {
			name: 'Hide text',
			options: [{ id: 'mode', type: 'dropdown', label: 'Hide text', default: 'toggle', choices: MODE_CHOICES }],
			callback: async ({ options }) =>
				options.mode === 'toggle' ? run('toggle_text') : run('set_text_hidden', { value: options.mode === 'on' }),
		},

		video: {
			name: 'Video / media transport',
			options: [
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					default: 'video_play',
					choices: [
						{ id: 'video_play', label: 'Play' },
						{ id: 'video_pause', label: 'Pause' },
						{ id: 'video_toggle', label: 'Play / pause' },
						{ id: 'video_stop', label: 'Stop' },
					],
				},
			],
			callback: async ({ options }) => run(String(options.command)),
		},

		videoSeek: {
			name: 'Video / media seek',
			options: [{ id: 'seconds', type: 'number', label: 'Position (s)', default: 0, min: 0, max: 86400 }],
			callback: async ({ options }) => run('video_seek', { position: Number(options.seconds) }),
		},

		videoSpeed: {
			name: 'Video / media speed',
			description: 'Every screen showing the video follows, crops included.',
			options: [
				{
					id: 'rate',
					type: 'dropdown',
					label: 'Speed',
					default: '1',
					choices: ['0.5', '0.75', '0.9', '1', '1.1', '1.25', '1.5', '2'].map((r) => ({ id: r, label: `${r}×` })),
					allowCustom: true,
				},
			],
			callback: async ({ options }) => run('video_rate', { rate: Number(options.rate) }),
		},

		masterSpeedSet: {
			name: 'Master speed: set',
			description: 'Every video following the master speed plays at this rate. Works well with a fader driving a variable.',
			options: [{ id: 'rate', type: 'number', label: 'Speed (1 = normal)', default: 1, min: 0.25, max: 4, step: 0.05 }],
			callback: async ({ options }) => run('master_speed', { value: Number(options.rate) }),
		},
		masterSpeedStep: {
			name: 'Master speed: step',
			description: 'Nudge the master speed — put +0.05 on a rotary encoder’s right turn and −0.05 on its left.',
			options: [{ id: 'step', type: 'number', label: 'Step', default: 0.05, min: -1, max: 1, step: 0.01 }],
			callback: async ({ options }) => run('master_speed', { step: Number(options.step) }),
		},
		masterSpeedReset: {
			name: 'Master speed: normal (1×)',
			options: [],
			callback: async () => run('master_speed', { reset: true }),
		},

		identifyWindows: simple('Identify output windows', 'identify_windows'),

		take: {
			...simple('Take (send the preview live)', 'take'),
			description: 'With “preview before live” in Live mode: the previewed slide goes to the screens.',
		},

		mode: {
			name: 'Prepare / Live mode',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'prepare', label: 'Prepare' },
						{ id: 'live', label: 'Live' },
					],
				},
			],
			callback: async ({ options }) => run('set_mode', { mode: options.mode }),
		},

		layer: {
			name: 'Show / hide a layer',
			description: 'The eyes in the layer bar.',
			options: [
				{
					id: 'layer',
					type: 'dropdown',
					label: 'Layer',
					default: 'toggle_background',
					choices: [
						{ id: 'toggle_background', label: 'Background' },
						{ id: 'toggle_media_layer', label: 'Media' },
						{ id: 'toggle_stage_overlays', label: 'Stage overlays (all)' },
					],
				},
			],
			callback: async ({ options }) => run(String(options.layer)),
		},

		stage: {
			name: 'Stage layer (timer, countdown, message)',
			options: [
				{
					id: 'layer',
					type: 'dropdown',
					label: 'Stage layer',
					default: layerChoices[0]?.id ?? '',
					choices: layerChoices,
					allowCustom: true,
				},
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					default: 'go',
					choices: [
						{ id: 'start', label: 'Start from the first cue' },
						{ id: 'go', label: 'Go (next cue)' },
						{ id: 'back', label: 'Back (previous cue)' },
						{ id: 'pause', label: 'Pause / resume' },
						{ id: 'plus_minute', label: '+1 minute (timer)' },
						{ id: 'minus_minute', label: '−1 minute (timer)' },
						{ id: 'stop', label: 'Stop (off the screens)' },
						{ id: 'hide', label: 'Hide / show' },
					],
				},
			],
			callback: async ({ options }) => run('stage', { layerId: Number(options.layer), command: options.command }),
		},
	})
}
