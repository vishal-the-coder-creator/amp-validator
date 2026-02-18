# Deployment Guide

This guide covers how to deploy the AMP Validator to various platforms.

## Prerequisites

- GitHub account
- Hosting account (Heroku, Render, Railway, etc.)
- Node.js installed locally
- Git installed

## 1. GitHub Repository

### Create a GitHub Repository

1. Go to https://github.com/new
2. Enter "amp-validator" as the repository name
3. Add description: "Batch validate AMP URLs - check if pages are valid Accelerated Mobile Pages"
4. Choose Public (to share publicly)
5. Click "Create repository"

### Push Code to GitHub

```bash
cd "c:\Users\r200362\OneDrive - HT Media Ltd\Desktop\AMP Validator"
git init
git add .
git commit -m "Initial commit: AMP batch validator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/amp-validator.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

## 2. Deploy to Heroku (Recommended)

### Option A: Using Heroku Dashboard

1. Go to https://dashboard.heroku.com/apps
2. Click "New" → "Create new app"
3. Enter app name: `amp-validator-yourname`
4. Choose region closest to you
5. Go to "Deploy" tab
6. Select "GitHub" as deployment method
7. Search for "amp-validator" repo
8. Click "Connect"
9. Enable "Automatic deploys" from main branch
10. Click "Deploy Branch"
11. Once deployed, click "Open app"

Your app will be live at: `https://amp-validator-yourname.herokuapp.com`

### Option B: Using Heroku CLI

```bash
# Install Heroku CLI from https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
heroku create amp-validator-yourname

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

## 3. Deploy to Render

1. Go to https://render.com
2. Sign up (free tier available)
3. Click "New+" → "Web Service"
4. Connect your GitHub account
5. Select "amp-validator" repository
6. Configure:
   - **Name**: amp-validator
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
7. Choose Free plan
8. Click "Create Web Service"

Your app will be live at: `https://amp-validator-XXXX.onrender.com` (Render generates a random subdomain)

## 4. Deploy to Railway

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project"
4. Select "GitHub Repo" and choose "amp-validator"
5. Configure environment variables if needed
6. Railway automatically detects Node.js and deploys
7. Get your public URL from the Railway dashboard

Your app will be live at: `https://YOUR_PROJECT.up.railway.app`

## 5. Deploy to Vercel

**Note**: Vercel is optimized for static sites and serverless functions. For a full Node.js server, Heroku, Render, or Railway are better options.

However, you can use Vercel with serverless functions by reorganizing the code.

## Environment Variables

If deploying to a platform, create these environment variables:

- `PORT`: defaults to 3000
- `NODE_ENV`: set to "production"

Most platforms automatically set these.

## Post-Deployment

After deployment:

1. Visit your public URL
2. Test batch validation with multiple URLs
3. Check server logs if there are issues
4. Share the public URL with others!

## Troubleshooting

### Validator File Not Found

If you get "Missing validator file" error:
- The validator_wasm.js file might not be downloaded
- Download it: `https://cdn.ampproject.org/v0/validator_wasm.js`
- Save to: `public/validator/validator_wasm.js`
- Commit and push

### Port Issues

If port 3000 is not available, the app uses the PORT environment variable. Most platforms set this automatically.

### CORS Issues

The app includes CORS headers for cross-origin requests. If you still see CORS errors, check:
- Browser console for actual errors
- Server logs for detailed information

## GitHub Actions (Optional CI/CD)

Create `.github/workflows/deploy.yml` for automatic deployment:

```yaml
name: Deploy to Heroku
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: "amp-validator-yourname"
          heroku_email: "your-email@gmail.com"
```

## Support

For issues during deployment:
1. Check the hosting platform's documentation
2. Review server logs
3. Verify all dependencies are in package.json
4. Ensure Node.js version compatibility

---

**Happy deploying!** 🚀
