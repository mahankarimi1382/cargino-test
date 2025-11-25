// api/product.js
// این فایل یک Serverless Function برای Vercel است

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // itemId را از querystring (GET) یا body (POST) می‌خوانیم
  let itemId = req.query.itemId;
  if (!itemId && req.body) {
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      itemId = body.itemId;
    } catch (e) {
      // اگر body JSON نباشد
    }
  }

  if (!itemId) {
    return res
      .status(400)
      .json({ success: false, error: "itemId parameter is required" });
  }

  // ⚠️ اینجا URL نهایی API را می‌سازیم.
  // برای مثال:
  // https://alibaba-datahub.p.rapidapi.com/item_detail?itemId=...
  const baseUrl = process.env.EXTERNAL_API_BASE_URL; // مثلاً: https://alibaba-datahub.p.rapidapi.com
  const path = process.env.EXTERNAL_API_PATH || "/item_detail"; // مثلاً: /item_detail

  if (!baseUrl) {
    return res.status(500).json({
      success: false,
      error:
        "EXTERNAL_API_BASE_URL is not set in environment variables on the server.",
    });
  }

  const url = `${baseUrl}${path}?itemId=${encodeURIComponent(itemId)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        // این هدرها را طبق مستندات سرویس واقعی تنظیم کن
        // مثال برای سرویسی مثل RapidAPI:
        // 'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        // 'x-rapidapi-host': process.env.RAPIDAPI_HOST,
        "X-Api-Key": process.env.EXTERNAL_API_KEY || "",
        "X-Api-Host": process.env.EXTERNAL_API_HOST || "",
      },
    });

    const data = await response.json().catch(() => null);
    const rawText = !data ? await response.text() : null;

    // هر statusCode غیر از 200 را هم به فرانت پاس می‌دهیم
    return res.status(response.status).json({
      success: response.ok,
      status: response.status,
      data: data || rawText,
    });
  } catch (err) {
    console.error("Error calling external API:", err);
    return res.status(500).json({
      success: false,
      error: "Internal error calling external API",
      details: err.message,
    });
  }
}
