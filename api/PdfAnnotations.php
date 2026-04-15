<?php

/**
 * PdfAnnotations API — per-annotation CRUD with sort_order-based undo.
 *
 * Endpoints:
 *   GET    /rest/PdfAnnotations/{songNumber}?filename=X            List all annotations for a PDF
 *   POST   /rest/PdfAnnotations/{songNumber}                       Insert a single annotation
 *   PUT    /rest/PdfAnnotations/{songNumber}/rename                Rename a layer
 *   DELETE /rest/PdfAnnotations/{songNumber}/undo?filename=X&layer=Y   Undo last annotation in a layer
 *   DELETE /rest/PdfAnnotations/{songNumber}/layer?filename=X&layer=Y  Clear entire layer
 *   DELETE /rest/PdfAnnotations/{songNumber}/{annotationId}            Delete a single annotation by ID
 */

require_once(__DIR__ . '/RestController.php');

class PdfAnnotations extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = intval($_SESSION['account']);

        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }
        $sn = intval($songNumber);

        $filename = $req->query->get('filename', '', false);
        if (!$filename) {
            $res->error(400, 'filename query parameter is required');
        }

        // GET /rest/PdfAnnotations/{songNumber}?filename=X — list all annotations
        $stmt = self::prepare(
            'SELECT id, layer, tool, page, x, y, color, opacity, sort_order, data, created_at
             FROM pdf_annotations
             WHERE account = ? AND songnumber = ? AND filename = ?
             ORDER BY sort_order ASC, id ASC'
        );
        $stmt->bind_param('iis', $account, $sn, $filename)->execute();
        $rows = [];
        $stmt->fetchAll($rows)->close();

        $results = [];
        foreach ($rows as $row) {
            $results[] = [
                'id' => intval($row['id']),
                'layer' => $row['layer'],
                'tool' => $row['tool'],
                'page' => intval($row['page']),
                'x' => floatval($row['x']),
                'y' => floatval($row['y']),
                'color' => $row['color'],
                'opacity' => floatval($row['opacity']),
                'sortOrder' => intval($row['sort_order']),
                'data' => json_decode($row['data'], true) ?: (object)[],
                'createdAt' => $row['created_at'],
            ];
        }
        $res->success($results);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $account = intval($_SESSION['account']);

        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }
        $sn = intval($songNumber);

        // POST /rest/PdfAnnotations/{songNumber} — insert a single annotation
        $filename = $req->params->get('filename', '', false);
        $layer = $req->params->get('layer', '', false);
        $tool = $req->params->get('tool', '', false);
        $page = intval($req->params->get('page', '0', false));
        $x = floatval($req->params->get('x', '0', false));
        $y = floatval($req->params->get('y', '0', false));
        $color = $req->params->get('color', '#ff0000', false);
        $opacity = floatval($req->params->get('opacity', '1.0', false));
        $data = $req->params->getAsArray('data', []);

        if (!$filename || !$layer || !$tool) {
            $res->error(400, 'filename, layer, and tool are required');
        }

        // Auto-assign sort_order = MAX(sort_order) + 1 for this (account, songnumber, filename, layer)
        $stmt = self::prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
             FROM pdf_annotations
             WHERE account = ? AND songnumber = ? AND filename = ? AND layer = ?'
        );
        $stmt->bind_param('iiss', $account, $sn, $filename, $layer)->execute()->fetchOne($row)->close();
        $sortOrder = intval($row['next_order'] ?? 1);

        $dataJson = json_encode($data);

        $stmt = self::prepare(
            'INSERT INTO pdf_annotations (account, songnumber, filename, layer, tool, page, x, y, color, opacity, sort_order, data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('iisssiddsdis', $account, $sn, $filename, $layer, $tool, $page, $x, $y, $color, $opacity, $sortOrder, $dataJson)->execute()->id($insertId)->close();

        $res->success([
            'id' => $insertId,
            'layer' => $layer,
            'tool' => $tool,
            'page' => $page,
            'x' => $x,
            'y' => $y,
            'color' => $color,
            'opacity' => $opacity,
            'sortOrder' => $sortOrder,
            'data' => $data,
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $account = intval($_SESSION['account']);

        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }
        $sn = intval($songNumber);

        // PUT /rest/PdfAnnotations/{songNumber}/rename — rename a layer
        if ($req->path->get(1, '', false) === 'rename') {
            $filename = $req->params->get('filename', '', false);
            $oldName = $req->params->get('oldName', '', false);
            $newName = $req->params->get('newName', '', false);

            if (!$filename || !$oldName || !$newName) {
                $res->error(400, 'filename, oldName, and newName are required');
            }

            $stmt = self::prepare(
                'UPDATE pdf_annotations SET layer = ? WHERE account = ? AND songnumber = ? AND filename = ? AND layer = ?'
            );
            $stmt->bind_param('siiss', $newName, $account, $sn, $filename, $oldName)->execute()->close();
            $res->success(['message' => 'Layer renamed']);
        }

        // PUT /rest/PdfAnnotations/{songNumber}/{annotationId} — update annotation position
        $annotationId = $req->path->get(1, '', false);
        if ($annotationId && is_numeric($annotationId)) {
            $aid = intval($annotationId);
            $x = floatval($req->params->get('x', '0', false));
            $y = floatval($req->params->get('y', '0', false));

            $stmt = self::prepare(
                'UPDATE pdf_annotations SET x = ?, y = ? WHERE id = ? AND account = ? AND songnumber = ?'
            );
            $stmt->bind_param('ddiii', $x, $y, $aid, $account, $sn)->execute()->close();
            $res->success(['message' => 'Annotation updated', 'id' => $aid, 'x' => $x, 'y' => $y]);
        }

        $res->error(400, 'Unknown PUT action');
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $account = intval($_SESSION['account']);

        $songNumber = $req->path->get(0, '', false);
        if (!$songNumber) {
            $res->error(400, 'Song number is required');
        }
        $sn = intval($songNumber);

        $action = $req->path->get(1, '', false);

        // DELETE /rest/PdfAnnotations/{songNumber}/undo?filename=X&layer=Y — undo last annotation
        if ($action === 'undo') {
            $filename = $req->query->get('filename', '', false);
            if (!$filename) {
                $filename = $req->params->get('filename', '', false);
            }
            $layer = $req->query->get('layer', '', false);
            if (!$layer) {
                $layer = $req->params->get('layer', '', false);
            }

            if (!$filename || !$layer) {
                $res->error(400, 'filename and layer are required');
            }

            // Find the annotation with the highest sort_order
            $stmt = self::prepare(
                'SELECT id, sort_order FROM pdf_annotations
                 WHERE account = ? AND songnumber = ? AND filename = ? AND layer = ?
                 ORDER BY sort_order DESC
                 LIMIT 1'
            );
            $stmt->bind_param('iiss', $account, $sn, $filename, $layer)->execute()->fetchOne($row)->close();

            if (!$row) {
                $res->success(['message' => 'Nothing to undo', 'deletedId' => null]);
            }

            $deleteId = intval($row['id']);
            $stmt = self::prepare('DELETE FROM pdf_annotations WHERE id = ? AND account = ?');
            $stmt->bind_param('ii', $deleteId, $account)->execute()->close();

            $res->success(['message' => 'Annotation undone', 'deletedId' => $deleteId]);
        }

        // DELETE /rest/PdfAnnotations/{songNumber}/layer?filename=X&layer=Y — clear entire layer
        if ($action === 'layer') {
            $filename = $req->query->get('filename', '', false);
            if (!$filename) {
                $filename = $req->params->get('filename', '', false);
            }
            $layer = $req->query->get('layer', '', false);
            if (!$layer) {
                $layer = $req->params->get('layer', '', false);
            }

            if (!$filename || !$layer) {
                $res->error(400, 'filename and layer are required');
            }

            $stmt = self::prepare(
                'DELETE FROM pdf_annotations WHERE account = ? AND songnumber = ? AND filename = ? AND layer = ?'
            );
            $stmt->bind_param('iiss', $account, $sn, $filename, $layer)->execute()->close();

            $res->success(['message' => 'Layer cleared']);
        }

        // DELETE /rest/PdfAnnotations/{songNumber}/{annotationId} — delete a single annotation
        if ($action && is_numeric($action)) {
            $annotationId = intval($action);
            $stmt = self::prepare('DELETE FROM pdf_annotations WHERE id = ? AND account = ? AND songnumber = ?');
            $stmt->bind_param('iii', $annotationId, $account, $sn)->execute()->close();
            $res->success(['message' => 'Annotation deleted', 'deletedId' => $annotationId]);
        }

        $res->error(400, 'Unknown DELETE action — use /undo, /layer, or /{id}');
    }
}
