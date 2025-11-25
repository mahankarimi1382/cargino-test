// api/product.js
//
// فقط این اندپوینت‌ها استفاده می‌شود:
//
// 1) Alibaba - Product Detail
//    Host: alibaba-datahub.p.rapidapi.com
//    Path: /item_detail?itemId={itemId}
//
// 2) 1688 - Product Detail
//    Host: 1688-datahub.p.rapidapi.com
//    Path: /item_detail?itemId={itemId}
//
// همه با یک env: RAPIDAPI_KEY کار می‌کنند.

const SERVICES = {
  // جزئیات محصول Alibaba
  alibaba_detail: [
    {
      name: "alibaba-datahub",
      host: "alibaba-datahub.p.rapidapi.com",
      buildPath: ({ itemId }) =>
        `/item_detail?itemId=${encodeURIComponent(itemId)}`,
    },
    // اگر بعداً یک provider دیگر برای Alibaba داشتی، اینجا اضافه کن
  ],

  // جزئیات محصول 1688
  "1688_detail": [
    {
      name: "1688-datahub",
      host: "1688-datahub.p.rapidapi.com",
      buildPath: ({ itemId }) =>
        `/item_detail?itemId=${encodeURIComponent(itemId)}`,
    },
  ],
};

export default async function handler(req, res) {
  // فقط GET
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Only GET allowed",
    });
  }

  const platform = req.query.platform || "alibaba"; // alibaba | 1688
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "RAPIDAPI_KEY is not set in environment variables",
    });
  }

  const itemId = req.query.itemId;
  if (!itemId) {
    return res.status(400).json({
      success: false,
      error: "itemId query parameter is required",
    });
  }

  // انتخاب سرویس بر اساس پلتفرم
  let serviceKey;
  if (platform === "1688") {
    serviceKey = "1688_detail";
  } else {
    // پیش‌فرض: Alibaba
    serviceKey = "alibaba_detail";
  }

  const providers = SERVICES[serviceKey];
  if (!providers || providers.length === 0) {
    return res.status(500).json({
      success: false,
      error: `هیچ سرویس فعالی برای ${serviceKey} تعریف نشده.`,
    });
  }

  const errors = [];

  // حلقه روی providerها (فعلاً برای هر کدوم فقط یکی هست)
  for (const provider of providers) {
    try {
      const path = provider.buildPath({ itemId });
      const url = `https://${provider.host}${path}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": provider.host,
        },
      });

      const data = await response.json().catch(async () => {
        const text = await response.text();
        return { rawText: text };
      });

      if (response.ok) {
        // موفق
        return res.status(200).json({
          success: true,
          platform,
          service: serviceKey,
          provider: provider.name,
          host: provider.host,
          status: response.status,
          data,
        });
      }

      // اگر limit / پلن تموم شده (429 یا 403)، برو بعدی
      if (response.status === 429 || response.status === 403) {
        errors.push({
          provider: provider.name,
          host: provider.host,
          status: response.status,
          data,
        });
        continue;
      }

      // سایر خطاها
      return res.status(response.status).json({
        success: false,
        platform,
        service: serviceKey,
        provider: provider.name,
        host: provider.host,
        status: response.status,
        data,
      });
    } catch (err) {
      errors.push({
        provider: provider.name,
        host: provider.host,
        status: 500,
        error: err.message,
      });
      continue;
    }
  }

  // اگر همه fail شدن
  return res.status(429).json({
    success: false,
    error:
      "هیچ‌کدام از سرویس‌های این پلتفرم پاسخ موفق ندادند (ممکن است همه به سقف پلن رسیده باشند یا خطای دیگر داشته باشند).",
    platform,
    service: serviceKey,
    providersTried: errors,
  });
}
