<?php
// Forwards a request for one page of a scooter's trip list to the Niu API, with the User-Agent of the
// Niu mobile app. Browsers do not let a web page set that header, and the same request sent straight
// from a browser gets HTTP 500. Nothing is stored, and only the trip fields the site uses go back.
declare(strict_types=1);

const NIU_API = 'https://app-api-fk.niu.com';
const USER_AGENT = 'manager/5.2.0 (android; SM-A202F 11);lang=pl-PL;clientIdentifier=Overseas;'
    . 'timezone=Europe/Warsaw;model=samsung_SM-A202F;deviceName=SM-A202F;ostype=android';
const CONNECT_TIMEOUT = 5;
const TIMEOUT = 15;
const TRIP_FIELDS = ['trackId', 'type', 'date', 'distance', 'power_consumption'];
const UNREADABLE = 'Niu sent an unreadable answer';

header('Content-Type: application/json');

function fail(int $httpStatus, string $message): never
{
    http_response_code($httpStatus);
    echo json_encode(['data' => [], 'status' => -1, 'desc' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    fail(405, 'Method not allowed');
}

$page = $_POST['page'] ?? '';
$sn = $_POST['sn'] ?? '';
$token = $_POST['token'] ?? '';
if (!is_string($page) || !preg_match('/^[1-9][0-9]{0,5}\z/', $page)) {
    fail(400, 'Invalid page');
}
if (!is_string($sn) || !preg_match('/^[A-Za-z0-9_-]{1,64}\z/', $sn)) {
    fail(400, 'Invalid serial number');
}
if (!is_string($token) || !preg_match('/^[\x21-\x7e]{1,4096}\z/', $token)) {
    fail(400, 'Invalid token');
}

$api = getenv('NIU_API_URL') ?: NIU_API;

$curl = curl_init("$api/v5/track/list/v3");
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['pagesize' => 100, 'index' => $page, 'sn' => $sn]),
    CURLOPT_HTTPHEADER => ['content-type: application/json', "token: $token", 'user-agent: ' . USER_AGENT],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
    CURLOPT_TIMEOUT => TIMEOUT,
]);
$output = curl_exec($curl);
if ($output === false) {
    if (curl_errno($curl) === CURLE_OPERATION_TIMEDOUT) {
        fail(504, 'Niu did not answer in time');
    }
    fail(502, 'Could not connect to Niu');
}
$code = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
if ($code !== 200) {
    fail(502, "Niu answered with HTTP $code");
}

$answer = json_decode($output, true, 512, JSON_BIGINT_AS_STRING);
if (!is_array($answer) || !is_int($answer['status'] ?? null)) {
    fail(502, UNREADABLE);
}
if ($answer['status'] !== 0) {
    echo json_encode(['data' => [], 'status' => $answer['status'], 'desc' => $answer['desc'] ?? 'Niu refused the request']);
    exit;
}
$items = $answer['data']['items'] ?? null;
if (!is_array($items)) {
    fail(502, UNREADABLE);
}

$trips = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        fail(502, UNREADABLE);
    }
    $trips[] = array_intersect_key($item, array_flip(TRIP_FIELDS));
}
echo json_encode(['status' => 0, 'data' => ['items' => $trips]]);
