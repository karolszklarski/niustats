<?php
// Forwards a request for one page of a scooter's trip list to the Niu API, with the User-Agent of the
// Niu mobile app, which browsers do not let a web page set. Nothing is stored.
declare(strict_types=1);

const NIU_API = 'https://app-api-fk.niu.com';
const USER_AGENT = 'manager/5.2.0 (android; SM-A202F 11);lang=pl-PL;clientIdentifier=Overseas;'
    . 'timezone=Europe/Warsaw;model=samsung_SM-A202F;deviceName=SM-A202F;ostype=android';
const CONNECT_TIMEOUT = 5; // seconds
const TIMEOUT = 15; // seconds, for the whole request

header('Content-Type: application/json');

/** Ends with an error shaped like a failed Niu answer, which the download page shows to the user. */
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

// The values go into the JSON body and a header of the request to Niu, so only the expected characters
// pass: \z rather than $, which would also accept a line break at the end.
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

// The tests point this at a stub of the Niu API.
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
echo $output;
