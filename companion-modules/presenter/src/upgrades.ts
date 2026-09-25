import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	/*
	 * Once an upgrade script is added here it can never be removed — Companion
	 * replays them in order against configs of any age.
	 */
]
