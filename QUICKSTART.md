# Quick Start: Deploy to GitHub & Get Public URL

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Fill in the form:
   - **Repository name**: `amp-validator`
   - **Description**: `Batch validate multiple AMP URLs at once`
   - **Public**: ✅ Check this
3. **Do NOT** initialize with README (we already have one)
4. Click **"Create repository"**

## Step 2: Push Code to GitHub

Copy and run these commands:

```bash
cd "c:\Users\r200362\OneDrive - HT Media Ltd\Desktop\AMP Validator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/amp-validator.git
git push -u origin main
```

**Replace `YOUR_USERNAME`** with your actual GitHub username.

## Step 3: Deploy to Render (Easiest Free Option)

### Why Render?
✅ Free tier with no credit card required
✅ Auto-deploys from GitHub
✅ Public URL immediately
✅ 750 free dyno hours/month (more than enough)

### Steps:

1. Go to https://render.com
2. Click **"Sign up"** and choose **"GitHub"**
3. Authorize Render to access your GitHub account
4. After sign-up, click **"New +"** → **"Web Service"**
5. Select your **"amp-validator"** repository
6. Configure these settings:
   - **Name**: `amp-validator`
   - **Region**: Choose closest to you (e.g., Singapore, N. Virginia)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
7. Under "Plan", select **"Free"**
8. Click **"Create Web Service"**
9. Wait 2-3 minutes for deployment
10. Your public URL will appear at the top of the page!

**Example URL**: `https://amp-validator-abc123.onrender.com`

## Step 4: Test Your Public URL

1. Copy the URL from Render dashboard
2. Open it in your browser
3. Paste URLs to validate:
   ```
   https://amp.dev
   https://www.hindustantimes.com/...amp.html
   ```
4. Click **"Validate URLs"** and enjoy! 🎉

## Alternative: Deploy to Railway

If Render is full, Railway is another great free option:

1. Go to https://railway.app
2. Sign in with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select **"amp-validator"**
5. Railway auto-detects and deploys!
6. Public URL shows in the Railway dashboard

**Example URL**: `https://amp-validator-prod.up.railway.app`

## Alternative: Deploy to Heroku

Heroku now requires a paid plan (~$7/month), but if you want to use it:

1. Go to https://www.heroku.com
2. Sign up
3. Install Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
4. Run in terminal:
   ```bash
   heroku login
   heroku create amp-validator-yourname
   git push heroku main
   ```
5. Open: `heroku open`

## Troubleshooting

### Issues After Deployment?

**Problem**: "Validator file not found"
- The validator_wasm.js might not be present
- Download: https://cdn.ampproject.org/v0/validator_wasm.js
- Save to: `public/validator/validator_wasm.js`
- Commit and push: `git add . && git commit -m "Add validator file" && git push`

**Problem**: Can't see the app
- Wait 2-3 minutes for deployment to complete
- Refresh the page
- Check the hosting platform's logs

**Problem**: Validation not working
- Check browser console (F12) for errors
- Check server logs in the hosting dashboard
- Create an issue on GitHub

## Share Your URL!

Once deployed, share your public URL with others:
- 📱 Use on mobile to validate AMP pages
- 🔗 Share the link: "Validate your AMP URLs here!"
- 💑 Batch validate hundreds of URLs at once

## More Info

📖 See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guides to other platforms.

---

**Estimated time to deployment**: 5-10 minutes ⚡

Once it's live, you can validate AMP URLs from anywhere in the world! 🌍
