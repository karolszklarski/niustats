<?php
$body = file_get_contents('php://input');
$sn = json_decode($body, true)['sn'] ?? '';

if ($sn === 'HTTP500') {
    http_response_code(500);
    exit;
}
if ($sn === 'SLOW') {
    sleep(30);
}
if ($sn === 'NOTJSON') {
    echo '<html>Service unavailable</html>';
    exit;
}

header('Content-Type: application/json');

if ($sn === 'REFUSED') {
    echo json_encode([
        'data' => null,
        'desc' => 'Incorrect Login Details',
        'status' => 1131,
        'trace' => 'Incorrect Login Details',
    ]);
    exit;
}
if ($sn === 'NOLIST') {
    echo json_encode(['status' => 0, 'desc' => 'ok', 'data' => null]);
    exit;
}
if ($sn === 'EMPTY') {
    echo json_encode(['status' => 0, 'desc' => 'ok', 'data' => ['items' => []]]);
    exit;
}

$trip = [
    'id' => 1,
    'trackId' => json_encode([
        'method' => $_SERVER['REQUEST_METHOD'],
        'path' => $_SERVER['REQUEST_URI'],
        'contentType' => $_SERVER['CONTENT_TYPE'] ?? null,
        'token' => $_SERVER['HTTP_TOKEN'] ?? null,
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'body' => $body,
    ]),
    'startTime' => 1704441600000,
    'endTime' => 1704442500000,
    'distance' => 6461,
    'avespeed' => 21,
    'ridingtime' => 900,
    'type' => 'complete',
    'date' => 20240105,
    'startPoint' => ['lat' => 54.35, 'lng' => 18.65],
    'lastPoint' => ['lat' => 54.37, 'lng' => 18.61],
    'track_thumb' => 'https://example.com/track.png',
    'power_consumption' => 13,
    'meet_count' => 0,
    'sn' => $sn,
    'sku_name' => 'NQi GTS',
    'trackCategory' => 0,
];
if ($sn === 'NOID') {
    unset($trip['trackId']);
}

echo json_encode(['status' => 0, 'desc' => 'ok', 'data' => ['items' => [$trip]]]);
