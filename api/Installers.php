<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Installers — the desktop app's installers the web root offers for download.
 *
 * They live in `/app`: the web build publishes this release's installers there without their
 * version (vite.config.ts), and a macOS build made on a Mac is uploaded there by hand. Listing
 * the folder means the download dialog offers exactly what is there — no link to a missing
 * file, and a system shows up as soon as its installer is uploaded.
 *
 *   GET /rest/Installers  →  { installers: [{ os, file, url, size, modified }] }
 *
 * `presenter-setup.*` comes first for its system, so a stray second file never wins over it.
 */
class Installers extends RestController
{
    /** File extension → the system it installs on. */
    private const OS_OF = [
        'exe' => 'windows',
        'dmg' => 'macos',
        'pkg' => 'macos',
        'AppImage' => 'linux',
        'deb' => 'linux',
        'rpm' => 'linux',
    ];

    protected function get(Request &$req, Response &$res): never
    {
        $dir = dirname(__DIR__) . '/app';
        $installers = [];

        foreach (is_dir($dir) ? scandir($dir) : [] as $file) {
            $os = self::OS_OF[pathinfo($file, PATHINFO_EXTENSION)] ?? null;
            $path = $dir . '/' . $file;
            if ($os === null || !is_file($path)) {
                continue;
            }
            $installers[] = [
                'os' => $os,
                'file' => $file,
                'url' => '/app/' . rawurlencode($file),
                'size' => filesize($path),
                'modified' => date(DATE_ATOM, filemtime($path)),
            ];
        }

        usort($installers, fn($a, $b) => [!str_starts_with($a['file'], 'presenter-setup'), $a['file']]
            <=> [!str_starts_with($b['file'], 'presenter-setup'), $b['file']]);

        $res->success(['installers' => $installers]);
    }
}
