// api/rates.js
//
// گرفتن نرخ لحظه‌ای از USD → IRR و CNY → و تبدیل به تومن
// از سرویس رایگان https://open.er-api.com/v6/latest/USD استفاده می‌کنیم.
// این سرویس IRR و CNY را برمی‌گرداند و API key هم نمی‌خواهد.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Only GET allowed",
    });
  }

  try {
    const url = "https://open.er-api.com/v6/latest/USD";

    const response = await fetch(url);
    const data = await response.json();

    // ساختار پاسخ:
    // {
    //   result: "success",
    //   base_code: "USD",
    //   rates: { USD:1, IRR:..., CNY:..., ... }
    // }

    if (
      !data ||
      data.result !== "success" ||
      !data.rates ||
      !data.rates.IRR ||
      !data.rates.CNY
    ) {
      return res.status(500).json({
        success: false,
        error: "نرخ ارز IRR یا CNY قابل دریافت نیست.",
        data,
      });
    }

    const usdToIrr = data.rates.IRR; // 1 USD → IRR (ریال)
    const usdToCny = data.rates.CNY; // 1 USD → CNY

    // 1 CNY → IRR
    const cnyToIrr = usdToIrr / usdToCny;

    // تبدیل به تومن (تقسیم بر ۱۰)
    const usdToToman = usdToIrr / 10;
    const cnyToToman = cnyToIrr / 10;

    return res.status(200).json({
      success: true,
      provider: data.provider,
      base_code: data.base_code,
      time_last_update_utc: data.time_last_update_utc,
      usdToIrr,
      cnyToIrr,
      usdToToman,
      cnyToToman,
    });
  } catch (err) {
    console.error("Error fetching FX rates:", err);
    return res.status(500).json({
      success: false,
      error: "Internal error fetching FX rates",
      details: err.message,
    });
  }
}
