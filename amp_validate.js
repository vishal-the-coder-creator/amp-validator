const fs = require('fs');
const path = require('path');
const amphtmlValidator = require('amphtml-validator');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}

async function main() {
  const htmlFormat = process.argv[2] || 'AMP';
  const validatorJsPath = path.join(__dirname, 'public', 'validator', 'validator_wasm.js');

  if (!fs.existsSync(validatorJsPath)) {
    process.stderr.write(
      JSON.stringify({
        success: false,
        error: `Missing local validator file at ${validatorJsPath}. Download https://cdn.ampproject.org/v0/validator_wasm.js and save it there.`,
      })
    );
    process.exit(2);
  }

  const html = await readStdin();
  if (typeof html !== 'string' || html.length === 0) {
    process.stderr.write(JSON.stringify({ success: false, error: 'Empty HTML input.' }));
    process.exit(3);
  }

  try {
    const validator = await amphtmlValidator.getInstance(validatorJsPath);
    const result = validator.validateString(html, htmlFormat);
    const errors = (result.errors || []).map((e) => ({
      line: e.line,
      col: e.col,
      severity: e.severity || 'ERROR',
      message: e.message,
      specUrl: e.specUrl || null,
      code: e.code || null,
    }));

    process.stdout.write(
      JSON.stringify({
        success: true,
        status: result.status,
        errors,
      })
    );
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        success: false,
        error: err && err.message ? err.message : 'Validation failed',
      })
    );
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(
    JSON.stringify({
      success: false,
      error: err && err.message ? err.message : 'Unexpected failure',
    })
  );
  process.exit(1);
});

