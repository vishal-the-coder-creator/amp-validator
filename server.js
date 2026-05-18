const express = require('express');
const cors = require('cors');
const amphtmlValidator = require('amphtml-validator');
const axios = require('axios');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const AMP_CSS_LIMIT_BYTES = 75 * 1024;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Browser-like User-Agent so sites (e.g. news portals) don't block the request
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Fetch HTML from a URL using axios (more reliable than fetch for web scraping).
 */
async function fetchHtml(url) {
  try {
    const response = await axios.get(url, {
      headers: FETCH_HEADERS,
      timeout: 20000,
      maxRedirects: 10,
      responseType: 'text',
    });

    // Check if final response is successful
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
    }

    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`URL did not return HTML (Content-Type: ${contentType}). Check that the URL points to a web page.`);
    }

    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new Error('Request timed out. The URL took too long to respond (20 seconds).');
      }
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        throw new Error(`Could not reach the URL: ${err.message}. Check the address and your connection.`);
      }
      if (err.response) {
        const status = err.response.status;
        const statusText = err.response.statusText || 'Unknown';
        throw new Error(`HTTP ${status}: ${statusText}. The server returned an error.`);
      }
      throw new Error(`Network error: ${err.message}`);
    }
    throw err.message ? new Error(err.message) : new Error('Failed to fetch URL.');
  }
}

function extractAmpCustomCss(html) {
  const ampCustomStyleRegex = /<style\b(?=[^>]*\bamp-custom\b)[^>]*>([\s\S]*?)<\/style>/i;
  const match = html.match(ampCustomStyleRegex);
  return match ? match[1] : null;
}

function getCssSizeMetrics(cssContent) {
  const cssBytes = Buffer.byteLength(cssContent, 'utf8');
  const remainingBytes = Math.max(AMP_CSS_LIMIT_BYTES - cssBytes, 0);

  return {
    cssBytes,
    cssKilobytes: Number((cssBytes / 1024).toFixed(2)),
    ampLimitBytes: AMP_CSS_LIMIT_BYTES,
    ampLimitKilobytes: 75,
    remainingBytes,
    remainingKilobytes: Number((remainingBytes / 1024).toFixed(2)),
    usagePercent: Number(((cssBytes / AMP_CSS_LIMIT_BYTES) * 100).toFixed(1)),
    exceedsLimit: cssBytes > AMP_CSS_LIMIT_BYTES,
  };
}

function stripCssComments(cssContent) {
  return cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeSelector(selector) {
  return selector.replace(/\s+/g, ' ').replace(/\s*([>+~,:])\s*/g, '$1').trim();
}

function countDeclarations(ruleBody) {
  return (ruleBody.match(/:[^;{}]+(?=;|$)/g) || []).length;
}

function extractCssBlocks(cssContent) {
  const blocks = [];
  const css = stripCssComments(cssContent);

  function walk(text, inMedia = false) {
    let buffer = '';

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (char === '{') {
        const selector = buffer.trim();
        buffer = '';

        let depth = 1;
        let bodyStart = i + 1;
        let j = bodyStart;

        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth += 1;
          if (text[j] === '}') depth -= 1;
          j += 1;
        }

        const body = text.slice(bodyStart, j - 1);
        const isMedia = /^@media\b/i.test(selector);
        const isRule = selector && !selector.startsWith('@');

        blocks.push({
          selector,
          body,
          isMedia,
          isRule,
          inMedia,
          sizeBytes: Buffer.byteLength(`${selector}{${body}}`, 'utf8'),
          declarationCount: isRule ? countDeclarations(body) : 0,
        });

        if (isMedia) {
          walk(body, true);
        }

        i = j - 1;
      } else if (char === ';') {
        buffer = '';
      } else {
        buffer += char;
      }
    }
  }

  walk(css, false);
  return blocks;
}

function getTopLargestRules(blocks, limit = 10) {
  return blocks
    .filter((block) => block.isRule)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, limit)
    .map((block) => ({
      selector: block.selector,
      sizeBytes: block.sizeBytes,
      sizeKilobytes: Number((block.sizeBytes / 1024).toFixed(2)),
      declarationCount: block.declarationCount,
      preview: block.body.replace(/\s+/g, ' ').trim().slice(0, 160),
    }));
}

function getLargestSelectors(blocks, limit = 10) {
  return blocks
    .filter((block) => block.isRule)
    .map((block) => ({
      selector: block.selector,
      length: block.selector.length,
      sizeBytes: Buffer.byteLength(block.selector, 'utf8'),
    }))
    .sort((a, b) => b.length - a.length)
    .slice(0, limit);
}

function analyzeCssContent(cssContent) {
  const cleanCss = stripCssComments(cssContent);
  const blocks = extractCssBlocks(cleanCss);
  const ruleBlocks = blocks.filter((block) => block.isRule);
  const mediaQueries = blocks.filter((block) => block.isMedia);
  const selectorEntries = ruleBlocks.flatMap((block) =>
    block.selector
      .split(',')
      .map((part) => normalizeSelector(part))
      .filter(Boolean)
  );

  const selectorFrequency = new Map();
  selectorEntries.forEach((selector) => {
    selectorFrequency.set(selector, (selectorFrequency.get(selector) || 0) + 1);
  });

  const duplicateSelectors = [...selectorFrequency.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([selector, count]) => ({ selector, count }));

  const emptyRules = ruleBlocks
    .filter((block) => stripCssComments(block.body).trim().length === 0)
    .map((block) => block.selector)
    .slice(0, 20);

  const totalCssBytes = Buffer.byteLength(cssContent, 'utf8');
  const estimatedGzipBytes = zlib.gzipSync(Buffer.from(cssContent, 'utf8')).length;

  const suggestions = [];
  if (duplicateSelectors.length > 0) {
    suggestions.push('Merge duplicate selectors to reduce repetition and improve maintainability.');
  }
  if (emptyRules.length > 0) {
    suggestions.push('Remove empty CSS rules that do not affect rendering.');
  }
  if (mediaQueries.length > 12) {
    suggestions.push('Review media queries for consolidation opportunities.');
  }
  if (selectorEntries.length > 0 && selectorEntries.length / Math.max(ruleBlocks.length, 1) > 2.5) {
    suggestions.push('Some rules have many selectors. Consider splitting or simplifying grouped selectors.');
  }
  if (totalCssBytes > AMP_CSS_LIMIT_BYTES * 0.9) {
    suggestions.push('You are close to the AMP CSS limit. Prioritize deduplication and trimming large rule blocks.');
  }
  if (suggestions.length === 0) {
    suggestions.push('CSS size looks healthy. Keep watching for repeated selectors and large rule groups as the stylesheet grows.');
  }

  return {
    totalRulesCount: ruleBlocks.length,
    totalSelectorsCount: selectorEntries.length,
    mediaQueriesCount: mediaQueries.length,
    duplicateSelectors,
    emptyRules,
    largestSelectors: getLargestSelectors(blocks),
    largestRules: getTopLargestRules(blocks),
    topLargestBlocks: getTopLargestRules(blocks),
    optimizationSuggestions: suggestions,
    estimatedGzipBytes,
    estimatedGzipKilobytes: Number((estimatedGzipBytes / 1024).toFixed(2)),
  };
}

/**
 * Validate AMP and return structured result with reasons and fix info.
 */
app.post('/api/validate', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid URL.',
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        error: 'URL must use http or https.',
      });
    }
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format. Example: https://example.com/page',
    });
  }

  let html;
  let fetchUrl = parsedUrl.href;
  try {
    html = await fetchHtml(fetchUrl);
  } catch (err) {
    console.error(`Fetch error for ${fetchUrl}:`, err.message);
    // If HTTP failed, try HTTPS (many sites redirect but some block non-browser first)
    if (parsedUrl.protocol === 'http:') {
      const httpsUrl = 'https:' + parsedUrl.href.slice(5);
      console.log(`Retrying with HTTPS: ${httpsUrl}`);
      try {
        html = await fetchHtml(httpsUrl);
        fetchUrl = httpsUrl;
      } catch (retryErr) {
        console.error(`HTTPS retry also failed:`, retryErr.message);
        return res.status(422).json({
          success: false,
          error: `Failed to fetch URL. HTTP error: ${err.message}. HTTPS error: ${retryErr.message}`,
          url: parsedUrl.href,
        });
      }
    } else {
      return res.status(422).json({
        success: false,
        error: err.message || 'Failed to fetch URL. Please check the URL and try again.',
        url: parsedUrl.href,
      });
    }
  }

  // Check if HTML was fetched successfully
  if (!html) {
    return res.status(422).json({
      success: false,
      error: 'The URL returned no content. Please check the URL.',
      url: parsedUrl.href,
    });
  }

  // Ensure HTML is a string
  if (typeof html !== 'string') {
    console.error('HTML is not a string:', typeof html);
    return res.status(422).json({
      success: false,
      error: 'The URL returned invalid content type. Expected HTML text.',
      url: parsedUrl.href,
    });
  }

  if (html.length === 0) {
    return res.status(422).json({
      success: false,
      error: 'The URL returned empty content. Please check the URL.',
      url: parsedUrl.href,
    });
  }

  // Log HTML size for debugging (truncate if too long)
  const preview = html.length > 200 ? html.substring(0, 200) + '...' : html;
  console.log(`Fetched HTML from ${fetchUrl}: ${html.length} characters`);
  console.log(`HTML preview: ${preview.replace(/\n/g, ' ')}`);

  try {
    // Initialize validator using local validator_wasm.js file to avoid CDN/network issues
    const validatorJsPath = path.join(__dirname, 'public', 'validator', 'validator_wasm.js');
    let validator;
    try {
      console.log('Initializing AMP validator from local file:', validatorJsPath);
      validator = await amphtmlValidator.getInstance(validatorJsPath);
      console.log('Validator initialized successfully');
      if (!validator || typeof validator.validateString !== 'function') {
        throw new Error('Validator instance is invalid - validateString method not found');
      }
    } catch (initErr) {
      console.error('Failed to initialize AMP validator from local file:', validatorJsPath);
      console.error('Error:', initErr);
      return res.status(500).json({
        success: false,
        error: `Failed to initialize AMP validator from local file: ${initErr.message || initErr.toString() || 'Unknown error'}`,
        url: parsedUrl.href,
      });
    }

    // Validate HTML
    let result;
    try {
      console.log('Validating HTML (length:', html.length, 'chars)...');
      if (!html || typeof html !== 'string') {
        throw new Error(`Invalid HTML input: type=${typeof html}, length=${html?.length || 0}`);
      }
      result = validator.validateString(html, 'AMP');
      console.log('Validation completed. Status:', result?.status);
    } catch (validateErr) {
      console.error('Validation error:');
      console.error('Error:', validateErr);
      console.error('Error message:', validateErr?.message);
      console.error('Error type:', validateErr?.constructor?.name);
      console.error('Error stack:', validateErr?.stack);
      return res.status(500).json({
        success: false,
        error: `Validation failed: ${validateErr?.message || validateErr?.toString() || 'Unknown error during validation'}. Check server logs.`,
        url: parsedUrl.href,
      });
    }

    // Check if result is valid
    if (!result || typeof result.status === 'undefined') {
      console.error('Invalid validator result:', result);
      console.error('Result type:', typeof result);
      console.error('Result keys:', result ? Object.keys(result) : 'null/undefined');
      return res.status(500).json({
        success: false,
        error: `Validator returned invalid result. Result: ${JSON.stringify(result)}. Check server logs.`,
        url: parsedUrl.href,
      });
    }

    const errors = (result.errors || []).map((e) => ({
      line: e.line,
      col: e.col,
      message: e.message,
      severity: e.severity || 'ERROR',
      specUrl: e.specUrl || null,
      code: e.code || null,
    }));

    const warnings = errors.filter((e) => e.severity === 'WARNING');
    const fatalErrors = errors.filter((e) => e.severity === 'ERROR');

    return res.json({
      success: true,
      url: fetchUrl,
      valid: result.status === 'PASS',
      status: result.status,
      errors: fatalErrors,
      warnings,
      fixSuggestions: fatalErrors.map((e) => ({
        message: e.message,
        location: e.line ? `Line ${e.line}${e.col ? `, column ${e.col}` : ''}` : null,
        specUrl: e.specUrl,
        howToFix: e.specUrl
          ? 'Open the specification link below for the official fix.'
          : 'Review the error message and adjust your AMP HTML accordingly.',
      })),
    });
  } catch (err) {
    console.error('Unexpected validator error:', err);
    console.error('Error type:', err?.constructor?.name || typeof err);
    console.error('Error message:', err?.message);
    console.error('Error stack:', err?.stack);
    console.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    
    // Extract meaningful error message
    let errorMessage = 'Unknown error occurred';
    if (err) {
      if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err.toString && err.toString() !== '[object Object]') {
        errorMessage = err.toString();
      } else {
        errorMessage = JSON.stringify(err);
      }
    }
    
    return res.status(500).json({
      success: false,
      error: `Server error: ${errorMessage}. Check server console for full details.`,
      url: parsedUrl.href,
    });
  }
});

app.post('/api/check-css-size', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid URL.',
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        error: 'URL must use http or https.',
      });
    }
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format. Example: https://example.com/page',
    });
  }

  let html;
  let fetchUrl = parsedUrl.href;
  try {
    html = await fetchHtml(fetchUrl);
  } catch (err) {
    console.error(`Fetch error for ${fetchUrl}:`, err.message);
    if (parsedUrl.protocol === 'http:') {
      const httpsUrl = 'https:' + parsedUrl.href.slice(5);
      console.log(`Retrying CSS check with HTTPS: ${httpsUrl}`);
      try {
        html = await fetchHtml(httpsUrl);
        fetchUrl = httpsUrl;
      } catch (retryErr) {
        console.error('HTTPS retry for CSS check also failed:', retryErr.message);
        return res.status(422).json({
          success: false,
          error: `Failed to fetch URL. HTTP error: ${err.message}. HTTPS error: ${retryErr.message}`,
          url: parsedUrl.href,
        });
      }
    } else {
      return res.status(422).json({
        success: false,
        error: err.message || 'Failed to fetch URL. Please check the URL and try again.',
        url: parsedUrl.href,
      });
    }
  }

  if (!html || typeof html !== 'string' || html.length === 0) {
    return res.status(422).json({
      success: false,
      error: 'The URL returned empty or invalid HTML content.',
      url: fetchUrl,
    });
  }

  const ampCustomCss = extractAmpCustomCss(html);
  if (ampCustomCss == null) {
    return res.status(404).json({
      success: false,
      error: 'No <style amp-custom> block found on this page.',
      url: fetchUrl,
    });
  }

  return res.json({
    success: true,
    url: fetchUrl,
    ...getCssSizeMetrics(ampCustomCss),
    rawCss: ampCustomCss,
    details: analyzeCssContent(ampCustomCss),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test endpoint to verify validator is working (using local validator file)
app.get('/api/test', async (req, res) => {
  try {
    const validatorJsPath = path.join(__dirname, 'public', 'validator', 'validator_wasm.js');
    const validator = await amphtmlValidator.getInstance(validatorJsPath);
    const testHtml = '<!doctype html><html ⚡><head><meta charset="utf-8"><script async src="https://cdn.ampproject.org/v0.js"></script><title>Test</title></head><body><h1>Hello AMP</h1></body></html>';
    const result = validator.validateString(testHtml, 'AMP');
    res.json({
      success: true,
      message: 'Validator is working correctly (local file)',
      testResult: result.status,
      errors: result.errors?.length || 0,
    });
  } catch (err) {
    console.error('Test endpoint error:', err);
    res.status(500).json({
      success: false,
      error: `Validator test failed (local file): ${err.message || 'Unknown error'}`,
    });
  }
});

/**
 * Fix invalid AMP attributes in HTML
 * Converts non-standard attributes (like consultancy, services, etc.) to data-* attributes
 */
function fixAmpHtml(html) {
  const invalidAttrs = [
    'consultancy', 'services', 'and', 'bank', 'financial', 
    'investment', 'advisory', 'other', 'platform', 'company',
    'contact', 'info', 'data', 'meta', 'custom', 'tracking'
  ];

  let fixed = html;
  let fixCount = 0;

  // Match <a ...> patterns and process them
  const aTagRegex = /<a\s+([^>]*?)>/gi;
  
  fixed = fixed.replace(aTagRegex, (match, attributes) => {
    let newAttributes = attributes;
    let tagFixed = false;

    // For each invalid attribute, check if it exists and convert it
    invalidAttrs.forEach((attr) => {
      const attrRegex = new RegExp(`\\b${attr}\\s*=\\s*(["\']?)([^"\'\\s>]*?)\\1`, 'gi');
      
      if (attrRegex.test(newAttributes)) {
        tagFixed = true;
        newAttributes = newAttributes.replace(attrRegex, `data-${attr}=$1$2$1`);
      }
    });

    if (tagFixed) {
      fixCount++;
    }

    return `<a ${newAttributes}>`;
  });

  return { fixed, fixCount };
}

/**
 * Endpoint to fix and validate AMP HTML
 */
app.post('/api/fix-and-validate', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid URL.',
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        error: 'URL must use http or https.',
      });
    }
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format. Example: https://example.com/page',
    });
  }

  let html;
  let fetchUrl = parsedUrl.href;
  try {
    html = await fetchHtml(fetchUrl);
  } catch (err) {
    console.error(`Fetch error for ${fetchUrl}:`, err.message);
    return res.status(422).json({
      success: false,
      error: err.message || 'Failed to fetch URL. Please check the URL and try again.',
      url: parsedUrl.href,
    });
  }

  try {
    const validatorJsPath = path.join(__dirname, 'public', 'validator', 'validator_wasm.js');
    const validator = await amphtmlValidator.getInstance(validatorJsPath);

    // Validate original HTML
    const originalResult = validator.validateString(html, 'AMP');
    const originalErrors = (originalResult.errors || []).filter(e => e.severity === 'ERROR');

    // Fix HTML
    const { fixed: fixedHtml, fixCount } = fixAmpHtml(html);

    // Validate fixed HTML
    const fixedResult = validator.validateString(fixedHtml, 'AMP');
    const fixedErrors = (fixedResult.errors || []).filter(e => e.severity === 'ERROR');

    const fixedErrorsData = fixedErrors.map((e) => ({
      line: e.line,
      col: e.col,
      message: e.message,
      severity: e.severity || 'ERROR',
      specUrl: e.specUrl || null,
      code: e.code || null,
    }));

    return res.json({
      success: true,
      url: fetchUrl,
      originalValid: originalResult.status === 'PASS',
      originalStatus: originalResult.status,
      originalErrorCount: originalErrors.length,
      fixesApplied: fixCount,
      fixedValid: fixedResult.status === 'PASS',
      fixedStatus: fixedResult.status,
      fixedErrorCount: fixedErrors.length,
      fixedErrors: fixedErrorsData,
      fixedHtml: fixedHtml,
      improvement: {
        errorsRemoved: originalErrors.length - fixedErrors.length,
        percentage: originalErrors.length > 0 ? Math.round(((originalErrors.length - fixedErrors.length) / originalErrors.length) * 100) : 0,
      },
      message: fixCount > 0 
        ? `Fixed ${fixCount} tags with invalid attributes. Errors reduced from ${originalErrors.length} to ${fixedErrors.length}.`
        : 'No invalid attributes found to fix.',
    });
  } catch (err) {
    console.error('Fix and validate error:', err);
    return res.status(500).json({
      success: false,
      error: `Server error: ${err.message || 'Unknown error'}`,
      url: parsedUrl.href,
    });
  }
});

app.listen(PORT, () => {
  console.log(`AMP Validator running at http://localhost:${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`Fix and validate endpoint: http://localhost:${PORT}/api/fix-and-validate`);
});
