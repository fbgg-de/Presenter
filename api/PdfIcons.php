<?php

/**
 * PdfIcons API — per-account custom SVG icon management (filesystem-backed).
 *
 * Icons are stored as SVG files in data/{account}/icons/.
 * No database table is used; the filesystem is the source of truth.
 *
 * Endpoints:
 *   GET    /rest/PdfIcons              List all icons for the account
 *   GET    /rest/PdfIcons/{filename}   Serve the icon SVG file
 *   POST   /rest/PdfIcons              Upload a new icon
 *   DELETE /rest/PdfIcons/{filename}   Delete an icon file
 */

require_once(__DIR__ . '/RestController.php');

class PdfIcons extends RestController
{
    private function getIconsBasePath(): string
    {
        return __DIR__ . '/../data/' . $_SESSION['account'] . '/icons';
    }

    private function ensureDir(string $path): void
    {
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
    }

    /** Derive a human-readable name from a stored filename (strips any leading uniqid prefix). */
    private function nameFromFilename(string $filename): string
    {
        // Strip the uniqid prefix added on upload (e.g. "icon_67f1a2b3c4d5e_my-icon.svg" → "my-icon")
        $base = pathinfo($filename, PATHINFO_FILENAME);
        if (preg_match('/^icon_[0-9a-f]+_(.+)$/', $base, $m)) {
            return $m[1];
        }
        return $base;
    }

    protected function get(Request &$req, Response &$res): never
    {
        $basePath = $this->getIconsBasePath();

        // GET /rest/PdfIcons/{filename} — serve SVG file
        $filename = $req->path->get(0, '', false);
        if ($filename !== '' && $filename !== null) {
            // Sanitize: prevent directory traversal
            $filename = basename($filename);
            $filePath = $basePath . '/' . $filename;

            if (!file_exists($filePath)) {
                $res->error(404, 'Icon file not found');
            }

            header('Content-Type: image/svg+xml');
            header('Content-Length: ' . filesize($filePath));
            header('Cache-Control: public, max-age=86400');
            readfile($filePath);
            exit;
        }

        // GET /rest/PdfIcons — list all icons by scanning the directory
        $results = [];
        if (is_dir($basePath)) {
            foreach (glob($basePath . '/*.svg') as $filePath) {
                $fn = basename($filePath);
                $results[] = [
                    'name'     => $this->nameFromFilename($fn),
                    'filename' => $fn,
                    'url'      => 'rest/PdfIcons/' . rawurlencode($fn),
                ];
            }
            usort($results, fn ($a, $b) => strcmp($a['name'], $b['name']));
        }

        $res->success($results);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $basePath = $this->getIconsBasePath();
        $this->ensureDir($basePath);

        if (empty($_FILES)) {
            $res->error(400, 'No file uploaded');
        }

        $fileInput = array_values($_FILES)[0];
        if ($fileInput['error'] !== UPLOAD_ERR_OK) {
            $res->error(400, 'File upload error: ' . $fileInput['error']);
        }

        $originalName = basename($fileInput['name']);
        if (!str_ends_with(strtolower($originalName), '.svg')) {
            $res->error(400, 'Only SVG files are allowed');
        }

        // Check file size (max 100 KB)
        if ($fileInput['size'] > 102400) {
            $res->error(400, 'Icon file must be smaller than 100 KB');
        }

        // Validate SVG content
        $content = file_get_contents($fileInput['tmp_name']);
        if ($content === false || stripos($content, '<svg') === false) {
            $res->error(400, 'Invalid SVG file');
        }

        // Use an explicit name param, or derive from the original filename
        $iconName = $req->params->get('name', '', false);
        if (!$iconName) {
            $iconName = pathinfo($originalName, PATHINFO_FILENAME);
        }
        // Sanitize icon name for safe use in the stored filename
        $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $iconName);

        // Generate a collision-resistant stored filename
        $storedFilename = 'icon_' . uniqid() . '_' . $safeName . '.svg';
        $dest = $basePath . '/' . $storedFilename;
        move_uploaded_file($fileInput['tmp_name'], $dest);

        $res->success([
            'message'  => 'Icon uploaded',
            'name'     => $iconName,
            'filename' => $storedFilename,
            'url'      => 'rest/PdfIcons/' . rawurlencode($storedFilename),
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $filename = $req->path->get(0, '', false);
        if (!$filename) {
            $res->error(400, 'Filename is required');
        }

        // Sanitize: prevent directory traversal
        $filename = basename($filename);
        $filePath = $this->getIconsBasePath() . '/' . $filename;

        if (!file_exists($filePath)) {
            $res->error(404, 'Icon file not found');
        }

        unlink($filePath);

        $res->success(['message' => 'Icon deleted']);
    }
}
