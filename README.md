# AMP Validator Tool

A web tool that validates whether URLs serve valid **AMP (Accelerated Mobile Pages)** HTML. **Validate multiple URLs at once** and get a summary report showing which pages are valid AMP and which have errors.

## Features

- **Batch Validation** – Enter multiple URLs at once (one per line) and validate them all in a single pass
- **Summary Report** – See total valid/invalid pages and error count at a glance
- **Detailed Results** – For each URL, view validation status and error details
- **Easy to Use** – No configuration needed, just paste URLs and click validate
- **Direct Feedback** – Each invalid page lists the errors with line numbers for easy fixing

## Requirements

- **Python 3.10+** (optional for Python backend)
- **Node.js 14+** (required for AMP validation engine)

## Setup & Run

### Quick Start (Node Backend) – Recommended

1. Install Node dependencies:

   ```bash
   npm install
   ```

2. Ensure the AMP validator file exists at `public/validator/validator_wasm.js`:
   - Download from: `https://cdn.ampproject.org/v0/validator_wasm.js`

3. Start the server:

   ```bash
   npm start
   # or: node server.js
   ```

4. Open in browser: **http://localhost:3000**

## Tech Stack

- **Backend:** Node.js, Express
- **Validation:** [amphtml-validator](https://www.npmjs.com/package/amphtml-validator) (official AMP validator)
- **Frontend:** HTML, CSS, JavaScript (no framework)

## API Endpoints

### POST `/api/validate`
Validates a URL against the AMP specification.

**Request:**
```json
{
  "url": "https://example.com/amp-page"
}
```

**Response (Success):**
```json
{
  "success": true,
  "url": "https://example.com/amp-page",
  "valid": false,
  "status": "FAIL",
  "errors": [
    {
      "line": 100,
      "col": 5,
      "message": "The attribute 'foo' may not appear in tag 'a'.",
      "severity": "ERROR",
      "specUrl": "https://amp.dev/...",
      "code": "DISALLOWED_ATTR"
    }
  ],
  "warnings": [],
  "fixSuggestions": [...]
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Failed to fetch URL. Please check the URL and try again.",
  "url": "https://example.com/amp-page"
}
```

## Example Usage

### Web Interface
1. Paste multiple URLs into the text area (one per line):
   ```
   https://example.com/article1-amp.html
   https://example.com/article2-amp.html
   https://news.example.com/story-amp.html
   ```
2. Click **"Validate URLs"**
3. See summary stats and detailed results for each URL

### CLI with Node.js
```bash
node fix_amp.js "https://example.com/single-amp-page.html"
```

### Via cURL (single URL)
```bash
curl -X POST http://localhost:3000/api/validate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/page-amp.html"}'
```

## License

MIT
