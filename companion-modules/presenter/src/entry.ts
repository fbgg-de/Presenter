/**
 * What a "Go to agenda entry" option means: a picked entry ({id, title, index} as JSON), or a typed
 * entry number (1 = first — also every button saved before entries had ids), or a typed title.
 * Presenter resolves id, then title, then index.
 */
export function entryTarget(value: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(value)
		if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
	} catch {
		// not a picked entry
	}
	return /^\s*\d+\s*$/.test(value) ? { index: Number(value) - 1 } : { title: value.trim() }
}
