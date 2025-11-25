<?php
// alibaba_api.php

// ---------- تنظیمات ----------

// اینجا کلید RapidAPI جدیدت رو بذار
const RAPIDAPI_KEY  = '07c403a591mshb7ad6d8e629c09ap13579cjsnd9b0f7c9637a';
const RAPIDAPI_HOST = 'alibaba-datahub.p.rapidapi.com';

// اسم endpoint را از صفحه RapidAPI → Code Snippet → PHP بردار
// اگر در snippet نوشته بود /item_detail_v1 اینجا هم همان را بگذار
const ENDPOINT_PATH = '/item_detail';

// نرخ تبدیل و کارمزد – هر طور خودت دوست داری تنظیم کن
const FX_RATE_TO_IRR      = 6500; // مثلا هر 1 واحد ارز (USD/CNY) = 6500 تومان
const SERVICE_FEE_PERCENT = 10;   // درصد کارمزد

header('Content-Type: application/json; charset=utf-8');

// فقط POST JSON قبول کنیم
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error'   => 'فقط درخواست POST مجاز است.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// بدنه درخواست را بخوانیم
$rawInput = file_get_contents('php://input');
$payload  = json_decode($rawInput, true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => 'فرمت ورودی معتبر نیست (باید JSON باشد).',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$productUrl = isset($payload['productUrl']) ? trim($payload['productUrl']) : '';
$quantity   = isset($payload['quantity']) ? (int)$payload['quantity'] : 1;

if (!filter_var($productUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => 'آدرس محصول معتبر نیست.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($quantity < 1) {
    $quantity = 1;
}

// ---------- تابع استخراج itemId از URL ----------
function extractAlibabaItemIdFromUrl(string $url): ?string
{
    // حالت رایج: ..._1601461818643.html
    if (preg_match('/_(\d+)\.html/', $url, $m)) {
        return $m[1];
    }
    // حالت دیگر: .../1601461818643.html
    if (preg_match('/\/(\d+)\.html/', $url, $m)) {
        return $m[1];
    }
    return null;
}

$itemId = extractAlibabaItemIdFromUrl($productUrl);
if (!$itemId) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => 'نتوانستم itemId را از لینک استخراج کنم. مطمئن شو لینک صفحه محصول Alibaba است.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- فراخوانی RapidAPI ----------
$apiUrl = 'https://' . RAPIDAPI_HOST . ENDPOINT_PATH . '?itemId=' . urlencode($itemId);

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_HTTPHEADER     => [
        'x-rapidapi-key: ' . RAPIDAPI_KEY,
        'x-rapidapi-host: ' . RAPIDAPI_HOST,
    ],
]);

$responseBody = curl_exec($ch);
if ($responseBody === false) {
    $error = curl_error($ch);
    curl_close($ch);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'خطا در اتصال به RapidAPI: ' . $error,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$responseJson = json_decode($responseBody, true);

if ($httpCode !== 200) {
    http_response_code($httpCode);
    $msg = is_array($responseJson) ? ($responseJson['msg'] ?? $responseJson['message'] ?? 'خطای ناشناخته') : 'خطای ناشناخته';
    echo json_encode([
        'success' => false,
        'error'   => "خطای API (HTTP $httpCode): " . $msg,
        'debug'   => $responseJson,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_array($responseJson)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'پاسخ RapidAPI JSON معتبر نیست.',
        'debug'   => $responseBody,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- پردازش داده‌ی محصول ----------
// بسته به ساختار واقعی JSON ممکن است 'data' یا 'result' باشد
$dataNode = $responseJson['data'] ?? $responseJson['result'] ?? $responseJson;

// عنوان
$title = $dataNode['title']
    ?? $dataNode['itemTitle']
    ?? 'عنوان نامشخص';

// قیمت
$price = null;
if (isset($dataNode['price'])) {
    $price = (float)$dataNode['price'];
} elseif (isset($dataNode['minPrice'])) {
    $price = (float)$dataNode['minPrice'];
} elseif (isset($dataNode['min_price'])) {
    $price = (float)$dataNode['min_price'];
}

$currency = $dataNode['currency'] ?? 'USD';

// تصویر
$imageUrl = null;
if (!empty($dataNode['images'][0])) {
    $imageUrl = $dataNode['images'][0];
} elseif (!empty($dataNode['mainImage'])) {
    $imageUrl = $dataNode['mainImage'];
}

if ($price === null) {
    echo json_encode([
        'success' => false,
        'error'   => 'API قیمتی برای این محصول برنگرداند.',
        'debug'   => $responseJson,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// محاسبه قیمت نهایی
$totalForeign = $price * $quantity;
$baseIRR      = $totalForeign * FX_RATE_TO_IRR;
$feeIRR       = $baseIRR * (SERVICE_FEE_PERCENT / 100);
$localPrice   = round($baseIRR + $feeIRR);

// ---------- پاسخ نهایی به فرانت ----------
echo json_encode([
    'success' => true,
    'product' => [
        'itemId'      => $itemId,
        'title'       => $title,
        'imageUrl'    => $imageUrl,
        'price'       => $price,
        'currency'    => $currency,
        'quantity'    => $quantity,
        'totalForeign'=> $totalForeign,
        'localPrice'  => $localPrice,
    ],
    'raw' => $responseJson, // برای دیباگ؛ بعداً در نسخه نهایی می‌تونی حذفش کنی
], JSON_UNESCAPED_UNICODE);
