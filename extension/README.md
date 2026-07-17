# TrueLens Chrome Extension

Right-click any image on the web to check if it's AI-generated.

## Features

- **Right-click to detect**: Right-click any image → "Check with TrueLens"
- **Floating result card**: Results appear directly below the image
- **Popup view**: Click the extension icon to see the last result
- **Bilingual**: Auto-detects browser language (Chinese / English)
- **Powered by TrueLens API**: Uses the same deep learning + EXIF analysis as truelens.top

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The TrueLens icon will appear in your toolbar

## Usage

1. Browse to any web page with images
2. Right-click an image
3. Select **"Check with TrueLens"** (or **"用 TrueLens 检测"** in Chinese)
4. A result card appears below the image showing:
   - AI probability score
   - Verdict (AI-generated / Real photo / Uncertain)
   - Top evidence items
   - Confidence and processing time
5. Click the extension icon to see the full result in the popup

## How It Works

```
Right-click image → background.js fetches image → POST to truelens.top/api/detect
→ content.js shows floating result card → popup stores last result
```

## Privacy

- Images are sent to `truelens.top` for analysis (same as the website)
- No data is stored on the server — images are processed in memory
- The last result is stored locally in `chrome.storage.local` for the popup view
- No browsing history or personal data is collected

## Publishing to Chrome Web Store

To publish to the Chrome Web Store:

1. Zip the extension folder contents (manifest.json must be at the root of the zip)
2. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Pay the one-time $5 registration fee
4. Upload the zip file
5. Fill in the listing details and submit for review

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Manifest V3 configuration |
| `background.js` | Service worker — context menu, image fetch, API call |
| `content.js` | Content script — floating result card injection |
| `content.css` | Styles for the floating card |
| `popup.html` | Popup UI when clicking the extension icon |
| `popup.js` | Popup logic — shows last result |
| `popup.css` | Popup styles |
| `_locales/` | Chrome i18n messages (en, zh_CN) |
| `icons/` | Extension icons (16, 48, 128px) |
