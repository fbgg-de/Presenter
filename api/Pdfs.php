<?php

require_once(__DIR__ . '/RestController.php');

class Pdfs extends RestController
{
    private function getPdfBasePath(): string
    {
        return __DIR__ . '/../data/' . $_SESSION['account'] . '/pdfs';
    }

    private function ensureDir(string $path): void
    {
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
    }

    protected function get(Request &$req, Response &$res): never
    {
        $basePath = $this->getPdfBasePath();

        // GET /rest/Pdfs/search?q=term
        if ($req->path->get(0, '', false) === 'search') {
            $q = $req->query->get('q', '', false);
            $results = [];

            if ($q && is_dir($basePath)) {
                $songDirs = scandir($basePath);
                foreach ($songDirs as $dir) {
                    if ($dir === '.' || $dir === '..') {
                        continue;
                    }
                    $songPath = $basePath . '/' . $dir;
                    if (!is_dir($songPath)) {
                        continue;
                    }

                    $files = scandir($songPath);
                    foreach ($files as $file) {
                        if ($file === '.' || $file === '..') {
                            continue;
                        }
                        if (!str_ends_with(strtolower($file), '.pdf')) {
                            continue;
                        }
                        if (stripos($file, $q) !== false || $dir === $q) {
                            $results[] = [
                                'songNumber' => intval($dir),
                                'filename' => $file,
                                'size' => filesize($songPath . '/' . $file),
                                'modified' => filemtime($songPath . '/' . $file),
                            ];
                        }
                    }
                }
            }

            $res->success($results);
        }

        // GET /rest/Pdfs/updates?since=timestamp
        if ($req->path->get(0, '', false) === 'updates') {
            $since = intval($req->query->get('since', '0', false));
            $results = [];

            if (is_dir($basePath)) {
                $songDirs = scandir($basePath);
                foreach ($songDirs as $dir) {
                    if ($dir === '.' || $dir === '..') {
                        continue;
                    }
                    $songPath = $basePath . '/' . $dir;
                    if (!is_dir($songPath)) {
                        continue;
                    }

                    $files = scandir($songPath);
                    foreach ($files as $file) {
                        if ($file === '.' || $file === '..') {
                            continue;
                        }
                        if (!str_ends_with(strtolower($file), '.pdf')) {
                            continue;
                        }
                        $mtime = filemtime($songPath . '/' . $file);
                        if ($mtime > $since) {
                            $results[] = [
                                'songNumber' => intval($dir),
                                'filename' => $file,
                                'size' => filesize($songPath . '/' . $file),
                                'modified' => $mtime,
                            ];
                        }
                    }
                }
            }

            $res->success($results);
        }

        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }

        $songPath = $basePath . '/' . $songNumber;

        // GET /rest/Pdfs/{songNumber}/mappings?filename=X
        // Mappings belong to the PDF file, not to a musician — the regions to map are the
        // same for everyone looking at that sheet. (Per-musician content lives in
        // pdf_annotations.layer instead.)
        if ($req->path->get(1, '', false) === 'mappings') {
            $filename = $req->query->get('filename', '', false);
            if (!$filename) {
                $res->error(400, 'filename query parameter is required');
            }

            $account = intval($_SESSION['account']);
            $sn = intval($songNumber);

            $stmt = self::prepare('SELECT mappings FROM pdf_area_mappings WHERE account = ? AND songnumber = ? AND filename = ?');
            $stmt->bind_param('iis', $account, $sn, $filename)->execute()->fetchOne($row)->close();

            if ($row && isset($row['mappings'])) {
                $mappings = json_decode($row['mappings'], true);
                $res->success($mappings ?: []);
            } else {
                $res->success([]);
            }
        }

        // GET /rest/Pdfs/{songNumber}/{filename} — serve file
        $filename = urldecode($req->path->get(1, '', false));
        if ($filename) {
            $filePath = $songPath . '/' . $filename;
            if (!file_exists($filePath)) {
                $res->error(404, 'PDF not found: ' . $filename);
            }

            $realBase = realpath($songPath);
            $realFile = realpath($filePath);
            if ($realBase === false || $realFile === false || !str_starts_with($realFile, $realBase)) {
                $res->error(403, 'Access denied');
            }

            header('Content-Type: application/pdf');
            header('Content-Length: ' . filesize($filePath));
            header('Content-Disposition: inline; filename="' . basename($filename) . '"');
            //header('Cache-Control: no-cache, no-store, must-revalidate');
            //header('Pragma: no-cache');
            //header('Expires: 0');
            readfile($filePath);
            exit;
        }

        // GET /rest/Pdfs/{songNumber} — list all PDFs
        $results = [];
        if (is_dir($songPath)) {
            $files = scandir($songPath);
            foreach ($files as $file) {
                if ($file === '.' || $file === '..') {
                    continue;
                }
                if (!str_ends_with(strtolower($file), '.pdf')) {
                    continue;
                }
                $results[] = [
                    'filename' => $file,
                    'size' => filesize($songPath . '/' . $file),
                    'modified' => filemtime($songPath . '/' . $file),
                ];
            }
        }

        $res->success($results);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }

        $songPath = $this->getPdfBasePath() . '/' . $songNumber;
        $this->ensureDir($songPath);

        $uploaded = [];

        if (!empty($_FILES)) {
            foreach ($_FILES as $fileInput) {
                // Handle both single and multi-file uploads
                if (is_array($fileInput['name'])) {
                    for ($i = 0; $i < count($fileInput['name']); $i++) {
                        if ($fileInput['error'][$i] !== UPLOAD_ERR_OK) {
                            continue;
                        }
                        $name = basename($fileInput['name'][$i]);
                        if (!str_ends_with(strtolower($name), '.pdf')) {
                            continue;
                        }

                        $dest = $songPath . '/' . $name;
                        move_uploaded_file($fileInput['tmp_name'][$i], $dest);
                        $uploaded[] = $name;
                    }
                } else {
                    if ($fileInput['error'] !== UPLOAD_ERR_OK) {
                        $res->error(400, 'File upload error: ' . $fileInput['error']);
                    }
                    $name = basename($fileInput['name']);
                    if (!str_ends_with(strtolower($name), '.pdf')) {
                        $res->error(400, 'Only PDF files are allowed');
                    }

                    $dest = $songPath . '/' . $name;
                    move_uploaded_file($fileInput['tmp_name'], $dest);
                    $uploaded[] = $name;
                }
            }
        }

        if (empty($uploaded)) {
            $res->error(400, 'No PDF files were uploaded');
        }

        $res->success(['message' => 'Uploaded ' . count($uploaded) . ' file(s)', 'files' => $uploaded]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }

        $songPath = $this->getPdfBasePath() . '/' . $songNumber;

        // PUT /rest/Pdfs/{songNumber}/mappings — save area mappings
        if ($req->path->get(1, '', false) === 'mappings') {
            $filename = $req->params->get('filename', '', false);
            $mappings = $req->params->getAsArray('mappings', []);

            if (!$filename) {
                $res->error(400, 'filename is required');
            }

            $account = intval($_SESSION['account']);
            $sn = intval($songNumber);
            $mappingsJson = json_encode($mappings);

            $stmt = self::prepare(
                'INSERT INTO pdf_area_mappings (account, songnumber, filename, mappings)
					 VALUES (?, ?, ?, ?)
					 ON DUPLICATE KEY UPDATE mappings = VALUES(mappings), updated_at = CURRENT_TIMESTAMP'
            );
            $stmt->bind_param('iiss', $account, $sn, $filename, $mappingsJson)->execute()->close();

            $res->success(['message' => 'Mappings saved']);
        }

        // PUT /rest/Pdfs/{songNumber}/{filename} — overwrite PDF file with raw bytes
        $filename = urldecode($req->path->get(1, '', false));
        if ($filename) {
            if (!str_ends_with(strtolower($filename), '.pdf')) {
                $res->error(400, 'Filename must end with .pdf');
            }

            $this->ensureDir($songPath);
            $filePath = $songPath . '/' . basename($filename);

            // Security: ensure the resolved path is within the song directory
            $realBase = realpath($songPath);
            if ($realBase === false) {
                $res->error(500, 'Failed to resolve song directory');
            }

            // Read raw body
            $body = file_get_contents('php://input');
            if ($body === false || strlen($body) === 0) {
                $res->error(400, 'Empty request body');
            }

            file_put_contents($filePath, $body);
            $res->success(['message' => 'Saved ' . $filename, 'size' => strlen($body)]);
        }

        // PUT /rest/Pdfs/{songNumber} — rename (existing behaviour)
        $oldName = $req->params->get('oldName', '', false);
        $newName = $req->params->get('newName', '', false);

        if (!$oldName || !$newName) {
            $res->error(400, 'Both oldName and newName are required');
        }

        if (!str_ends_with(strtolower($newName), '.pdf')) {
            $res->error(400, 'New name must end with .pdf');
        }

        $songPath = $this->getPdfBasePath() . '/' . $songNumber;
        $oldPath = $songPath . '/' . basename($oldName);
        $newPath = $songPath . '/' . basename($newName);

        if (!file_exists($oldPath)) {
            $res->error(404, 'PDF not found: ' . $oldName);
        }

        $realBase = realpath($songPath);
        $realOld = realpath($oldPath);
        if ($realBase === false || $realOld === false || !str_starts_with($realOld, $realBase)) {
            $res->error(403, 'Access denied');
        }

        rename($oldPath, $newPath);

        // Move the filename-keyed metadata (area mappings + annotations) with the file, otherwise
        // it is orphaned and lost when a PDF is renamed (e.g. promoting/demoting the default).
        $account = intval($_SESSION['account']);
        $sn      = intval($songNumber);
        $oldBase = basename($oldName);
        $newBase = basename($newName);
        foreach (['pdf_area_mappings', 'pdf_annotations'] as $table) {
            self::prepare("UPDATE `{$table}` SET `filename` = ? WHERE `account` = ? AND `songnumber` = ? AND `filename` = ?")
                ->bind_param('siis', $newBase, $account, $sn, $oldBase)->execute()->close();
        }

        $res->success(['message' => 'Renamed ' . $oldName . ' to ' . $newName]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }

        $filename = urldecode($req->path->get(1, '', false));
        if (!$filename) {
            $filename = $req->params->get('filename', '', false);
        }

        if (!$filename) {
            $res->error(400, 'Filename is required');
        }

        $songPath = $this->getPdfBasePath() . '/' . $songNumber;
        $filePath = $songPath . '/' . basename($filename);

        if (!file_exists($filePath)) {
            $res->error(404, 'PDF not found');
        }

        // Security: ensure the resolved path is within the song directory
        $realBase = realpath($songPath);
        $realFile = realpath($filePath);
        if ($realBase === false || $realFile === false || !str_starts_with($realFile, $realBase)) {
            $res->error(403, 'Access denied');
        }

        unlink($filePath);
        $res->success(['message' => 'Deleted ' . $filename]);
    }
}
