<?
$page = $_POST['page'];
$token = $_POST['token'];
$sn = $_POST['sn'];
$curl = curl_init();
curl_setopt($curl, CURLOPT_URL, "https://app-api-fk.niu.com/v5/track/list/v3");
curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
curl_setopt($curl, CURLOPT_HTTPHEADER, array("content-type: application/json", "token: $token", 'user-agent: manager/5.2.0 (android);clientIdentifier=Overseas'));
curl_setopt($curl, CURLOPT_POST, true);
curl_setopt($curl, CURLOPT_POSTFIELDS, '{"pagesize":100,"index":"'.$page.'","sn":"'.$sn.'"}');
$output = curl_exec($curl);
$code = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);
if ($code != 200) {
  exit('{"data":[],"status":-1,"desc":"Code '.$code.'"}');
}
echo($output);
