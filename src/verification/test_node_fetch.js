// Test HF API from Node.js environment (same as Next.js server)
const HF_TOKEN = "YOUR_HF_TOKEN_HERE";
const fs = require("fs");

const imageBuffer = fs.readFileSync("C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/src/verification/test_images/real_photo_1.jpg");

const url = "https://router.huggingface.co/hf-inference/models/Ateeqq/ai-vs-human-image-detector";

console.log("Testing URL:", url);
console.log("Image size:", imageBuffer.length, "bytes");

async function test() {
  try {
    console.log("Sending request...");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "image/jpeg",
      },
      body: imageBuffer,
    });

    console.log("Status:", response.status);
    console.log("Headers:", Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log("Response:", text);
  } catch (err) {
    console.error("Error type:", err.constructor.name);
    console.error("Error message:", err.message);
    console.error("Error code:", err.code);
    console.error("Full error:", err);
  }
}

test();
