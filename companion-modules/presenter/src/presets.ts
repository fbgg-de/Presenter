import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { BLOCK_SLOTS, ITEM_SLOTS } from './state.js'
import { AMBER, GREEN, LIVE_RED } from './feedbacks.js'

type Preset = NonNullable<CompanionPresetDefinitions<ModuleSchema>[string]>
type Steps = Extract<Preset, { type: 'simple' }>['steps']
type Feedbacks = Extract<Preset, { type: 'simple' }>['feedbacks']

const WHITE = 0xffffff
const BLACK = 0x000000
const DARK = 0x262626

const button = (name: string, text: string, down: Steps[number]['down'], feedbacks: Feedbacks = [], bgcolor = DARK): Preset => ({
	type: 'simple',
	name,
	style: { text, size: 'auto', color: WHITE, bgcolor },
	steps: [{ down, up: [] }],
	feedbacks,
})

/**
 * Every preset is fixed; the live parts come from variables and feedbacks, so a button placed
 * before a show was loaded still shows the right title and colour once it is.
 */
export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {
		prevSlide: button('Previous slide', '◀\n$(presenter:slideName)', [{ actionId: 'prevSlide', options: {} }]),
		nextSlide: button('Next slide', '▶\n$(presenter:nextSlideName)', [{ actionId: 'nextSlide', options: {} }]),
		prevItem: button('Previous entry', '⏮ ENTRY', [{ actionId: 'prevItem', options: {} }]),
		nextItem: button('Next entry', '⏭\n$(presenter:nextItemTitle)', [{ actionId: 'nextItem', options: {} }]),
		now: button('Now on screen', '$(presenter:itemTitle)\n$(presenter:slideNumber)/$(presenter:slideCount) $(presenter:slideName)', []),

		black: button(
			'Black',
			'BLACK',
			[{ actionId: 'black', options: { mode: 'toggle' } }],
			[{ feedbackId: 'isBlack', options: {}, style: { bgcolor: LIVE_RED, color: WHITE } }],
			BLACK,
		),
		text: button(
			'Hide text',
			'HIDE\nTEXT',
			[{ actionId: 'text', options: { mode: 'toggle' } }],
			[{ feedbackId: 'textHidden', options: {}, style: { bgcolor: AMBER, color: WHITE } }],
		),
		identify: button('Identify windows', 'IDENTIFY', [{ actionId: 'identifyWindows', options: {} }]),
		take: button(
			'Take',
			'TAKE',
			[{ actionId: 'take', options: {} }],
			[{ feedbackId: 'previewPending', options: {}, style: { bgcolor: GREEN, color: WHITE } }],
		),
		mode: button(
			'Prepare / Live',
			'$(presenter:mode)',
			[{ actionId: 'mode', options: { mode: 'toggle' } }],
			[{ feedbackId: 'isLiveMode', options: {}, style: { bgcolor: LIVE_RED, color: WHITE } }],
		),
		ready: button('Ready check', '$(presenter:readyLabel)', [], [{ feedbackId: 'readiness', options: {} }]),
		background: button(
			'Background layer',
			'BACK-\nGROUND',
			[{ actionId: 'layer', options: { layer: 'toggle_background' } }],
			[{ feedbackId: 'layerHidden', options: { layer: 'background' }, style: { bgcolor: AMBER, color: WHITE } }],
		),
		mediaLayer: button(
			'Media layer',
			'MEDIA\nLAYER',
			[{ actionId: 'layer', options: { layer: 'toggle_media_layer' } }],
			[{ feedbackId: 'layerHidden', options: { layer: 'media' }, style: { bgcolor: AMBER, color: WHITE } }],
		),
		overlays: button(
			'Stage overlays',
			'STAGE\nOVERLAYS',
			[{ actionId: 'layer', options: { layer: 'toggle_stage_overlays' } }],
			[{ feedbackId: 'layerHidden', options: { layer: 'stage' }, style: { bgcolor: AMBER, color: WHITE } }],
		),

		play: button('Play', '▶ PLAY', [{ actionId: 'video', options: { command: 'video_play' } }]),
		pause: button('Pause', '❚❚ PAUSE', [{ actionId: 'video', options: { command: 'video_pause' } }]),
		stop: button('Stop', '■ STOP', [{ actionId: 'video', options: { command: 'video_stop' } }]),
		// A rotary encoder: turn to nudge by 0.05, press for normal speed. Also works as a plain button.
		masterSpeed: {
			type: 'simple',
			name: 'Master speed (rotary: turn to change, press for 1×)',
			style: { text: 'SPEED\n$(presenter:masterSpeed)', size: 'auto', color: WHITE, bgcolor: DARK },
			steps: [
				{
					down: [{ actionId: 'masterSpeedReset', options: {} }],
					up: [],
					rotate_left: [{ actionId: 'masterSpeedStep', options: { step: -0.05 } }],
					rotate_right: [{ actionId: 'masterSpeedStep', options: { step: 0.05 } }],
				},
			],
			feedbacks: [{ feedbackId: 'masterSpeedChanged', options: {}, style: { bgcolor: AMBER, color: WHITE } }],
		},
		masterSlower: button('Master speed −0.05', 'SPEED\n−', [{ actionId: 'masterSpeedStep', options: { step: -0.05 } }]),
		masterFaster: button('Master speed +0.05', 'SPEED\n+', [{ actionId: 'masterSpeedStep', options: { step: 0.05 } }]),
		playPause: button(
			'Play / pause with time left',
			'⏯ $(presenter:mediaRemaining)\n$(presenter:mediaLabel)',
			[{ actionId: 'video', options: { command: 'video_toggle' } }],
			[{ feedbackId: 'mediaPlaying', options: {}, style: { bgcolor: LIVE_RED, color: WHITE } }],
		),
	}

	// One row per stage layer: Go with its live timer, Start over, Pause.
	const stageIds: string[] = []
	for (const layer of self.client.getState().stageLayers) {
		const v = (field: string) => `$(presenter:stage_${layer.id}_${field})`
		const layerId = String(layer.id)
		const hidden = { feedbackId: 'stageLayerHidden' as const, options: { layer: layerId }, style: { color: 0x808080 } }
		presets[`stage_${layer.id}_go`] = button(
			`${layer.name}: Go`,
			`${v('name')}\n${v('time')}\n${v('cue')}`,
			[{ actionId: 'stage', options: { layer: layerId, command: 'go' } }],
			[{ feedbackId: 'stageTimer', options: { layer: layerId } }, hidden],
		)
		presets[`stage_${layer.id}_start`] = button(`${layer.name}: Start over`, `⏮\n${v('name')}`, [
			{ actionId: 'stage', options: { layer: layerId, command: 'start' } },
		])
		presets[`stage_${layer.id}_pause`] = button(
			`${layer.name}: Pause`,
			`❚❚\n${v('name')}`,
			[{ actionId: 'stage', options: { layer: layerId, command: 'pause' } }],
			[{ feedbackId: 'stageLayerPaused', options: { layer: layerId }, style: { bgcolor: AMBER, color: WHITE } }],
		)
		stageIds.push(`stage_${layer.id}_go`, `stage_${layer.id}_start`, `stage_${layer.id}_pause`)
	}

	const itemIds: string[] = []
	for (let i = 1; i <= ITEM_SLOTS; i++) {
		const id = `item_${i}`
		itemIds.push(id)
		presets[id] = button(
			`Agenda entry ${i}`,
			`$(presenter:item_${i})`,
			[{ actionId: 'goItem', options: { index: String(i) } }],
			[{ feedbackId: 'itemIsLive', options: { index: i }, style: { bgcolor: LIVE_RED, color: WHITE } }],
		)
	}

	const slideIds: string[] = []
	for (let i = 1; i <= BLOCK_SLOTS; i++) {
		const id = `slide_${i}`
		slideIds.push(id)
		presets[id] = button(
			`Slide ${i}`,
			`$(presenter:slide_${i})`,
			[{ actionId: 'goSlide', options: { index: i } }],
			// Colour first, live last: the slide on screen is red whatever its section.
			[
				{ feedbackId: 'sectionColor', options: { index: i } },
				{ feedbackId: 'slideIsLive', options: { index: i }, style: { bgcolor: LIVE_RED, color: WHITE } },
			],
		)
	}

	const section = (id: string, name: string, description: string, ids: string[]): CompanionPresetSection => ({
		id,
		name,
		definitions: [{ id: `${id}-buttons`, name, description, type: 'simple', presets: ids }],
	})

	self.setPresetDefinitions(
		[
			section('navigation', 'Navigation', 'Slides and agenda entries, labelled with what comes next.', [
				'prevSlide',
				'nextSlide',
				'prevItem',
				'nextItem',
				'now',
			]),
			section('output', 'Output', 'Black, hidden text and the layer eyes light up while on, as in the layer bar.', [
				'black',
				'text',
				'background',
				'mediaLayer',
				'overlays',
				'identify',
			]),
			section('operator', 'Operator', 'Take a previewed slide, switch Prepare/Live, and the pre-service readiness check.', [
				'take',
				'mode',
				'ready',
			]),
			section('media', 'Media', 'Acts on the playing media entry — content first, else the background. The speed buttons set the master speed every following video plays at.', [
				'masterSpeed',
				'masterSlower',
				'masterFaster',
				'playPause',
				'play',
				'pause',
				'stop',
			]),
			section('stage', 'Stage', 'Per stage layer: Go with its timer (amber and red at its warn and danger times), start over, pause.', stageIds),
			section('agenda', 'Agenda', 'One button per agenda entry, titled from the show; the live one is red.', itemIds),
			section(
				'slides',
				'Slides',
				'The live entry’s slides in their section colours (verse blue, chorus violet…); the one on screen is red.',
				slideIds,
			),
		],
		presets,
	)
}
