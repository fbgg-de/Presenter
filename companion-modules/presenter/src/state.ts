/**
 * The operator state Presenter broadcasts as `state_update` (src/renderer/src/hooks/
 * useBroadcastCompanionState.ts). Fields a Presenter older than this module does not send
 * fall back to the defaults below.
 */
export type PresenterState = {
	showTitle: string
	/** 0-based, like the wire; variables show it 1-based. */
	itemIndex: number
	showItemCount: number
	itemTitle: string
	nextItemTitle: string
	showItemType: string
	songTitle: string
	songNumber: number | null
	orderName: string
	blockIndex: number
	blockCount: number
	blockName: string
	nextBlockName: string
	lineIndex: number
	isBlack: boolean
	isTextHidden: boolean
	items: { title: string; type: string }[]
	/** The live item's sections; `color` is Presenter's section colour ("#3b82f6") or null. */
	blocks: { name: string; color: string | null }[]
	operatorMode: 'prepare' | 'live'
	/** A slide waits in the preview for Take (preview before live). */
	previewPending: boolean
	videoVisible: boolean
	mediaVisible: boolean
	stageHidden: boolean
	stageLayers: StageLayer[]
	/** The entry play/pause acts on; `time` is its position when Presenter sent this. */
	media: { label: string; playing: boolean; time: number; duration: number; rate?: number } | null
	ready: boolean
	readinessIssues: string[]
	/** The master video speed every following video plays at (1 = normal). */
	masterRate: number
	/** Presenter's clock when it sent this, epoch ms — timer anchors are in that clock. */
	sentAt: number
}

export type StageLayer = {
	id: number
	name: string
	cueName: string
	cueIndex: number
	cueCount: number
	paused: boolean
	hidden: boolean
	/** Started this session; before that nothing of it is on screen. */
	started: boolean
	finished: boolean
	/** Countdown/count-up: epoch ms in Presenter's clock (`anchor`), frozen while paused. */
	timer: {
		direction: 'down' | 'up'
		anchor: number
		frozenAt: number | null
		clampAtZero: boolean
		warnSec: number | null
		dangerSec: number | null
	} | null
}

export const emptyState = (): PresenterState => ({
	showTitle: '',
	itemIndex: 0,
	showItemCount: 0,
	itemTitle: '',
	nextItemTitle: '',
	showItemType: '',
	songTitle: '',
	songNumber: null,
	orderName: '',
	blockIndex: 0,
	blockCount: 0,
	blockName: '',
	nextBlockName: '',
	lineIndex: 0,
	isBlack: false,
	isTextHidden: false,
	items: [],
	blocks: [],
	operatorMode: 'prepare',
	previewPending: false,
	videoVisible: true,
	mediaVisible: true,
	stageHidden: false,
	stageLayers: [],
	media: null,
	ready: true,
	readinessIssues: [],
	masterRate: 1,
	sentAt: 0,
})

/** Seconds as m:ss or h:mm:ss, with a minus sign for overtime. */
export const formatSeconds = (seconds: number): string => {
	const sign = seconds < 0 ? '-' : ''
	const total = Math.floor(Math.abs(seconds))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = String(total % 60).padStart(2, '0')
	return h ? `${sign}${h}:${String(m).padStart(2, '0')}:${s}` : `${sign}${m}:${s}`
}

/** Generated agenda and section buttons. Enough for a full Stream Deck XL page each. */
export const ITEM_SLOTS = 32
export const BLOCK_SLOTS = 16

/** "#3b82f6" → 0x3b82f6, or the fallback. */
export const hexColor = (hex: string | null | undefined, fallback: number): number => {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
	return match ? parseInt(match[1], 16) : fallback
}
