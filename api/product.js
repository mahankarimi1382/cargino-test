// api/product.js

export default async function handler(req, res) {
  // فقط GET قبول کنیم (کافیه برای تست)
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Only GET allowed" });
  }

  const itemId = req.query.itemId;

  if (!itemId) {
    return res
      .status(400)
      .json({ success: false, error: "itemId query parameter is required" });
  }

  const host = process.env.RAPIDAPI_HOST || "alibaba-datahub.p.rapidapi.com";
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "RAPIDAPI_KEY is not set in environment variables",
    });
  }

  // آدرس همون اندپوینت item_detail روی RapidAPI
  const url = `https://${host}/item_detail?itemId=${encodeURIComponent(itemId)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": host,
      },
    });

    const data = await response.json().catch(async () => {
      const text = await response.text();
      return { rawText: text };
    });

    return res.status(response.status).json({
      success: response.ok,
      status: response.status,
      data,
    });
  } catch (err) {
    console.error("Error calling RapidAPI:", err);
    return res.status(500).json({
      success: false,
      error: "Internal error calling RapidAPI",
      details: err.message,
    });
  }
}
