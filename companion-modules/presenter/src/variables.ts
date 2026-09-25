import type ModuleInstance from './main.js'
import { BLOCK_SLOTS, ITEM_SLOTS, formatSeconds } from './state.js'

export type VariablesSchema = Record<string, string | number | boolean | undefined>

const FIXED: Record<string, string> = {
	connected: 'Connected to Presenter',
	showTitle: 'Show title',
	itemTitle: 'Live agenda entry',
	nextItemTitle: 'Next agenda entry',
	itemType: 'Live entry type (song/media/bible_verse)',
	itemNumber: 'Live entry number (1 = first)',
	itemCount: 'Number of agenda entries',
	songTitle: 'Live song title',
	songNumber: 'Live song number',
	arrangement: 'Live song arrangement',
	slideName: 'Section on screen',
	nextSlideName: 'Next section',
	slideNumber: 'Slide number (1 = first)',
	slideCount: 'Number of slides of the live entry',
	isBlack: 'Screens are black',
	textHidden: 'Text is hidden',
	mode: 'Mode (prepare/live)',
	previewPending: 'A slide waits in the preview',
	ready: 'Ready for the service',
	readyLabel: 'READY, or how many checks need a look',
	readinessIssues: 'What to check, joined',
	mediaLabel: 'Playing media entry',
	mediaPlaying: 'Media is playing',
	mediaElapsed: 'Media position, m:ss',
	mediaRemaining: 'Media time left, m:ss',
	mediaSpeed: 'Media speed (1 = normal)',
	masterSpeed: 'Master speed, for display (1.25×)',
	masterSpeedValue: 'Master speed as a number (1 = normal)',
}

/** Fixed variables plus one per agenda slot (`item_3`) and slide slot (`slide_2`), for generated buttons. */
export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: Record<string, { name: string }> = {}
	for (const [id, name] of Object.entries(FIXED)) definitions[id] = { name }
	for (let i = 1; i <= ITEM_SLOTS; i++) definitions[`item_${i}`] = { name: `Agenda entry ${i}` }
	for (let i = 1; i <= BLOCK_SLOTS; i++) definitions[`slide_${i}`] = { name: `Slide ${i} of the live entry` }
	for (const layer of self.client.getState().stageLayers) {
		definitions[`stage_${layer.id}_name`] = { name: `Stage layer “${layer.name}”: name` }
		definitions[`stage_${layer.id}_cue`] = { name: `Stage layer “${layer.name}”: current cue` }
		definitions[`stage_${layer.id}_time`] = { name: `Stage layer “${layer.name}”: timer, m:ss` }
	}
	self.setVariableDefinitions(definitions)
}

export function buildVariableValues(self: ModuleInstance): Record<string, string | number | boolean> {
	const s = self.client.getState()
	const values: Record<string, string | number | boolean> = {
		connected: self.client.isConnected(),
		showTitle: s.showTitle,
		itemTitle: s.itemTitle,
		nextItemTitle: s.nextItemTitle,
		itemType: s.showItemType,
		itemNumber: s.showItemCount ? s.itemIndex + 1 : 0,
		itemCount: s.showItemCount,
		songTitle: s.songTitle,
		songNumber: s.songNumber ?? '',
		arrangement: s.orderName,
		slideName: s.blockName,
		nextSlideName: s.nextBlockName,
		slideNumber: s.blockCount ? s.blockIndex + 1 : 0,
		slideCount: s.blockCount,
		isBlack: s.isBlack,
		textHidden: s.isTextHidden,
		mode: s.operatorMode,
		previewPending: s.previewPending,
		ready: s.ready,
		readyLabel: s.ready ? 'READY' : `${s.readinessIssues.length} TO CHECK`,
		readinessIssues: s.readinessIssues.join(' · '),
		mediaLabel: s.media?.label ?? '',
		mediaPlaying: !!s.media?.playing,
		mediaElapsed: s.media ? formatSeconds(self.client.mediaElapsed()) : '',
		// Time left in wall-clock seconds: what remains of the media, at the playing speed.
		mediaRemaining:
			s.media && s.media.duration > 0 ? formatSeconds((s.media.duration - self.client.mediaElapsed()) / (s.media.rate ?? 1)) : '',
		mediaSpeed: s.media?.rate ?? 1,
		masterSpeed: `${Number(s.masterRate.toFixed(2))}×`,
		masterSpeedValue: s.masterRate,
	}
	for (const layer of s.stageLayers) {
		const seconds = self.client.timerSeconds(layer)
		values[`stage_${layer.id}_name`] = layer.name
		values[`stage_${layer.id}_cue`] = layer.finished ? '' : layer.cueName
		values[`stage_${layer.id}_time`] = seconds === null ? '' : formatSeconds(seconds)
	}
	for (let i = 1; i <= ITEM_SLOTS; i++) values[`item_${i}`] = s.items[i - 1]?.title ?? ''
	for (let i = 1; i <= BLOCK_SLOTS; i++) values[`slide_${i}`] = s.blocks[i - 1]?.name ?? ''
	return values
}
