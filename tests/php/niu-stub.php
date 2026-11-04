<?php
// Stands in for the Niu API in the track.php tests. It answers with the request it got,
// or fails when the serial number in the request asks it to.
$body = file_get_contents('php://input');
$sn = json_decode($body, true)['sn'] ?? '';

if ($sn === 'HTTP500') {
    http_response_code(500);
    exit;
}
if ($sn === 'SLOW') {
    sleep(30);
}

header('Content-Type: application/json');
echo json_encode([
    'status' => 0,
    'data' => [
        'items' => [],
        'request' => [
            'method' => $_SERVER['REQUEST_METHOD'],
            'path' => $_SERVER['REQUEST_URI'],
            'contentType' => $_SERVER['CONTENT_TYPE'] ?? null,
            'token' => $_SERVER['HTTP_TOKEN'] ?? null,
            'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'body' => $body,
        ],
    ],
]);
