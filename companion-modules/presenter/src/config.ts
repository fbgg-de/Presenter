import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Presenter desktop app',
			width: 12,
			value:
				'Connects to the WebSocket server built into the Presenter desktop app. Settings → Remote Control → External control there shows its addresses and can pause Companion commands.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Presenter host',
			width: 8,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 9001,
		},
	]
}
