// api/product.js
//
// لیست سرویس‌هایی که این فایل استفاده می‌کند (همه از RapidAPI با یک RAPIDAPI_KEY):
//
// 1) Alibaba product detail
//    Host: alibaba-datahub.p.rapidapi.com
//    Path: /item_detail?itemId={itemId}
//
// 2) 1688 product detail
//    Host: 1688-datahub.p.rapidapi.com
//    Path: /item_detail?itemId={itemId}
//
// 3) Taobao/Tmall product detail (TKL)
//    Host: taobao-tmall-16881.p.rapidapi.com
//    Path: /api/tkl/item/detail?provider=taobao&id={itemId}
//
// 4) Taobao search
//    Host: taobao-datahub.p.rapidapi.com
//    Path: /item_search?q={q}&page={page}&loc={loc}&startPrice={startPrice}&endPrice={endPrice}&switches={switches}&pageSize={pageSize}
//
// نکته: همهٔ این‌ها از یک env: RAPIDAPI_KEY استفاده می‌کنند.
// ساختار مشابه برای افزودن providerهای جدید (مثلاً Alibaba دوم) آماده است.

const SERVICES = {
  // جزئیات محصول Alibaba
  alibaba_detail: [
    {
      name: "alibaba-datahub",
      host: "alibaba-datahub.p.rapidapi.com",
      buildPath: ({ itemId }) =>
        `/item_detail?itemId=${encodeURIComponent(itemId)}`,
    },
    // اگر بعداً یک provider دیگر برای Alibaba داشتی، اینجا یک object دیگر اضافه کن.
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

  // سرچ محصول در Taobao
  taobao_search: [
    {
      name: "taobao-datahub",
      host: "taobao-datahub.p.rapidapi.com",
      buildPath: ({ query }) => {
        const params = new URLSearchParams();

        if (query.q) params.set("q", query.q);
        if (query.page) params.set("page", query.page);
        if (query.loc) params.set("loc", query.loc);
        if (query.startPrice) params.set("startPrice", query.startPrice);
        if (query.endPrice) params.set("endPrice", query.endPrice);
        if (query.switches) params.set("switches", query.switches);
        if (query.pageSize) params.set("pageSize", query.pageSize);

        // اگر خواستی می‌تونی اینجا default بذاری (مثلاً page=1, pageSize=20)
        return `/item_search?${params.toString()}`;
      },
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

  const platform = req.query.platform || "alibaba"; // alibaba | 1688 | taobao | taobao_search
  const action = req.query.action || "detail"; // detail | search

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "RAPIDAPI_KEY is not set in environment variables",
    });
  }

  let serviceKey;

  if (action === "search") {
    // فعلاً فقط سرچ Taobao را پشتیبانی می‌کنیم
    if (platform === "taobao" || platform === "taobao_search") {
      serviceKey = "taobao_search";
    } else {
      return res.status(400).json({
        success: false,
        error: "search فعلاً فقط برای Taobao پشتیبانی می‌شود.",
      });
    }
  } else {
    // action = detail
    if (platform === "1688") {
      serviceKey = "1688_detail";
    } else if (platform === "taobao") {
      serviceKey = "taobao_detail";
    } else {
      // پیش‌فرض: Alibaba
      serviceKey = "alibaba_detail";
    }
  }

  const providers = SERVICES[serviceKey];
  if (!providers || providers.length === 0) {
    return res.status(500).json({
      success: false,
      error: `هیچ سرویس فعالی برای ${serviceKey} تعریف نشده.`,
    });
  }

  // اعتبارسنجی پارامترها
  const itemId = req.query.itemId;

  if (action === "detail" && !itemId) {
    return res.status(400).json({
      success: false,
      error: "itemId query parameter is required for detail action",
    });
  }

  if (action === "search") {
    if (!req.query.q) {
      return res.status(400).json({
        success: false,
        error: "q query parameter is required for search action",
      });
    }
  }

  const errors = [];

  // روی لیست providerها حلقه می‌زنیم (برای failover اگر یکی limit شد)
  for (const provider of providers) {
    try {
      const path = provider.buildPath({
        itemId,
        query: req.query,
      });

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
          service: serviceKey,
          provider: provider.name,
          host: provider.host,
          status: response.status,
          data,
        });
      }

      // اگر پلن تموم شده/limit (مثلاً 429 یا بعضی وقت‌ها 403)، می‌رویم سراغ provider بعدی
      if (response.status === 429 || response.status === 403) {
        errors.push({
          provider: provider.name,
          host: provider.host,
          status: response.status,
          data,
        });
        continue;
      }

      // سایر خطاها را همان‌جا برمی‌گردانیم (مثلاً 401, 404, 500)
      return res.status(response.status).json({
        success: false,
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
      continue;
    }
  }

  // اگر همه‌ی providerها خطا دادن یا limit شدند
  return res.status(429).json({
    success: false,
    error:
      "هیچ‌کدام از سرویس‌های این پلتفرم پاسخ موفق ندادند (ممکن است همه به سقف پلن رسیده باشند یا خطا داشته باشند).",
    service: serviceKey,
    providersTried: errors,
  });
}
