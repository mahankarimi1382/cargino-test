// api/rates.js
//
// گرفتن نرخ لحظه‌ای از USD → IRR و CNY → و تبدیل به تومن
// از سرویس رایگان https://api.exchangerate.host/latest استفاده می‌کنیم.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Only GET allowed",
    });
  }

  try {
    // یک درخواست: پایه USD، فقط نرخ‌های IRR و CNY
    const url =
      "https://api.exchangerate.host/latest?base=USD&symbols=IRR,CNY";

    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.rates || !data.rates.IRR || !data.rates.CNY) {
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
      base: data.base,
      date: data.date,
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
