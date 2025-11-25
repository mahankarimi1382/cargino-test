// api/product.js
//
// لیست اندپوینت‌هایی که این فایل استفاده می‌کند (همه با یک RAPIDAPI_KEY):
//
// 1) Alibaba - Product Detail
//    Host: alibaba-datahub.p.rapidapi.com
//    Path: /item_detail?itemId={itemId}
//
// 2) 1688 - Product Detail
//    Host: 1688-datahub.p.rapidapi.com
//    Path: /item_detail?itemId={itemId}
//
// 3) Taobao/Tmall - Product Detail (TKL)
//    Host: taobao-tmall-16881.p.rapidapi.com
//    Path: /api/tkl/item/detail?provider=taobao&id={itemId}
//
// نکته‌ها:
// - همه از یک env: RAPIDAPI_KEY استفاده می‌کنند.
// - برای هر سرویس یک آرایه از providerها داریم؛
//   اگر بعداً provider دوم هم اضافه کنی، به ترتیب چک می‌شوند
//   و اگر اولی 429/403 داد (پلن/لیمیت)، می‌رود سراغ بعدی.

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
    // {
    //   name: "alibaba-backup",
    //   host: "some-other-host.p.rapidapi.com",
    //   buildPath: ({ itemId }) =>
    //     `/item_detail?itemId=${encodeURIComponent(itemId)}`,
    // },
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

  // جزئیات محصول Taobao/Tmall (TKL)
  taobao_detail: [
    {
      name: "taobao-tmall-16881",
      host: "taobao-tmall-16881.p.rapidapi.com",
      buildPath: ({ itemId }) =>
        `/api/tkl/item/detail?provider=taobao&id=${encodeURIComponent(
          itemId
        )}`,
    },
  ],
};

export default async function handler(req, res) {
  // فعلاً فقط GET
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Only GET allowed",
    });
  }

  const platform = req.query.platform || "alibaba"; // alibaba | 1688 | taobao
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

  // تعیین سرویس بر اساس پلتفرم
  let serviceKey;
  if (platform === "1688") {
    serviceKey = "1688_detail";
  } else if (platform === "taobao") {
    serviceKey = "taobao_detail";
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

  // روی providerها حلقه می‌زنیم (برای آینده اگر چند تا داشته باشی)
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
        // موفق شد، دیگه نیازی به بقیه providerها نیست
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

      // اگر limit / پلن تموم شده (429 یا 403)، نگه می‌داریم و می‌رویم بعدی
      if (response.status === 429 || response.status === 403) {
        errors.push({
          provider: provider.name,
          host: provider.host,
          status: response.status,
          data,
        });
        continue; // برو provider بعدی
      }

      // سایر خطاها: همان‌جا برگرد
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
      // خطای شبکه / داخلی
      errors.push({
        provider: provider.name,
        host: provider.host,
        status: 500,
        error: err.message,
      });
      continue; // برو provider بعدی (اگر وجود داشته باشد)
    }
  }

  // اگر همه‌ی providerها fail شدند (مثلاً همه limit شدند)
  return res.status(429).json({
    success: false,
    error:
      "هیچ‌کدام از سرویس‌های این پلتفرم پاسخ موفق ندادند (ممکن است همه به سقف پلن رسیده باشند یا خطای دیگر داشته باشند).",
    platform,
    service: serviceKey,
    providersTried: errors,
  });
}
