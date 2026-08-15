# 📚 Complete R2 Backup Setup Guide for AI Business Advisor

This comprehensive guide will walk you through setting up **automated daily backups** from your Railway PostgreSQL database to Cloudflare R2 using GitHub Actions.

---

## 🎯 What You'll Accomplish

By the end of this guide, you will have:
- ✅ Created a Cloudflare R2 storage bucket
- ✅ Set up API credentials for R2
- ✅ Configured GitHub Actions workflow for automated backups
- ✅ Backups uploading to R2 every day automatically at 2:00 AM UTC
- ✅ Backup retention policies configured
- ✅ Disaster recovery plan in place

---

## 📋 Prerequisites

Before you start, make sure you have:
- ✅ A Cloudflare account (sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up))
- ✅ A GitHub account with your repository
- ✅ Railway account with PostgreSQL database deployed
- ✅ Access to Railway dashboard to get `DATABASE_PUBLIC_URL`
- ✅ Admin access to your GitHub repository

---

## 📋 Step-by-Step Instructions

### **STEP 1: Create a Cloudflare Account** (If you don't have one)

1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Sign up with your email (it's free!)
3. Verify your email address
4. You're ready to continue!

---

### **STEP 2: Enable R2 on Your Cloudflare Account**

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the left sidebar, expand **"Storage & databases"** section
3. Expand **"R2 object storage"** 
4. Click **"Overview"**
5. If you see "Enable R2", click it
6. You may need to add a payment method (don't worry, R2 has a generous free tier - first 10 GB is free!)
7. Wait for R2 to be enabled (usually instant)

---

### **STEP 3: Create Your Backup Bucket**

A "bucket" is like a folder where your backups will be stored.

1. Navigate to R2: In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"**
2. Click **"Create bucket"** button
3. **Bucket name**: Enter `business-advisor-database-backups` (or any name you prefer)
   - ✅ Must be lowercase
   - ✅ Can contain numbers and hyphens
   - ✅ Must be unique across all Cloudflare accounts
   - ⚠️ **Important**: Bucket name is permanent and cannot be changed later
4. **Location** (radio buttons - select one):
   - **"Automatic"** is preselected (recommended) - Cloudflare will choose the best location (typically Western North America)
   - You can optionally provide a location hint if you need a specific region
   - For backups, "Automatic" is perfectly fine
   - **OR** select **"Specify jurisdiction"** if you have data residency requirements
     - Only needed for compliance requirements (e.g., keeping data in EU-only)
     - If selected, locations within the specified jurisdiction will be automatically chosen
     - For most backups, you don't need this - stick with "Automatic"
6. **Default Storage Class**:
   - **"Standard"** is preselected (recommended for backups)
   - This is recommended for objects accessed at least once a month
   - "Infrequent Access" is available but not recommended for backups (use only if you rarely need to restore)
7. Click **"Create bucket"** button
8. ✅ Your bucket is created!

**Note**: By default, buckets are not publicly accessible. This is perfect for backups - they'll only be accessible via API with your credentials.

**📝 Remember your bucket name** - you'll need it for the GitHub Secrets in Step 7.

---

### **STEP 4: Get Your Account ID**

You need this to configure the backup workflow. The Account ID is the same for all your R2 buckets.

**Method 1: From Bucket Settings (Easiest)**

1. Navigate to your bucket: In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"** → click your bucket name
2. Click the **"Settings"** tab
3. Scroll down to the **"General"** section
4. Look for **"S3 API"** - you'll see a URL like:
   ```
   https://a430exxljghaioe7fc2241a3ee1121eb.r2.cloudflarestorage.com/business-advisor-database-backups
   ```
5. The Account ID is the part before `.r2.cloudflarestorage.com` (the long string of letters and numbers)
   - In the example above, it's: `a430exxljghaioe7fc2241a3ee1121eb`
6. Click the copy icon next to the S3 API URL, or manually copy just the Account ID part

**Method 2: From Account Details (Also shows S3 API)**

1. Navigate to R2 Overview: In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"**
2. Scroll down to the **"Account Details"** section
3. You'll see:
   - **Account ID**: A long string of letters and numbers (click copy icon to copy)
   - **S3 API**: The endpoint URL (this is also your R2_ENDPOINT for Step 7)
4. Copy the Account ID

**Method 3: From URL**

1. Navigate to R2 Overview: In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"**
2. Look at the URL: `https://dash.cloudflare.com/[ACCOUNT_ID]/r2/...`
3. The Account ID is the part between `/` and `/r2/`

**📝 Remember your Account ID** - you'll need it for the GitHub Secrets in Step 7.

---

### **STEP 5: Create API Token (This is Important!)**

This gives the backup workflow permission to upload files to R2.

**Method: R2-Specific API Tokens (Recommended)**

1. Go to your R2 dashboard: https://dash.cloudflare.com
   - In the left sidebar, expand **"Storage & databases"** section
   - Expand **"R2 object storage"**
   - Click **"Overview"**
   - ⚠️ **Important**: Stay on the main R2 Overview page (don't click into a specific bucket)
2. Look for **"Account Details"** section (usually at the top of the R2 page)
3. Find **"API Tokens"** with a **"Manage"** button next to it
4. Click the **"Manage"** button
5. You'll see two options:
   - **Account API Tokens** (recommended for production)
   - **User API Tokens** (for personal/development)
6. **Click "Create Account API Token"** button (under Account API Tokens section)
   - ✅ **Why Account?** These tokens remain active even if you leave the organization
   - ✅ Perfect for production database backups

**Fill out the form:**

7. **Token name**: Enter `Business Advisor Database Backups` (or any descriptive name)
   - Must be at least 2 characters

8. **Permissions**: Select **"Object Read & Write"** (the third option)
   - ✅ This allows reading, writing, and listing objects in your bucket
   - ❌ Don't select "Admin Read & Write" (that's too powerful)
   - ❌ Don't select "Read only" (you need write access for backups)

9. **Specify bucket(s)**: Select **"Apply to specific buckets only"**
   - Then select your bucket: `business-advisor-database-backups`
   - This limits the token to only your backup bucket (more secure)

10. **TTL (Time To Live)**: Select **"Forever"**
    - This keeps the token active indefinitely (good for automated backups)
    - If you prefer, you can set a specific expiration date, but "Forever" is recommended

11. **Client IP Address Filtering**: Leave these **empty/default**
    - You can restrict by IP later if needed, but for now leave it open
    - GitHub Actions will use different IPs, so filtering would break the backup

12. Click **"Create Account API Token"** button (bottom of the form)

13. ⚠️ **CRITICAL**: Copy the token details immediately! You won't be able to see them again!
    - **Access Key ID**: Copy this (looks like: `abc123def456...`)
    - **Secret Access Key**: Copy this (looks like a long random string)
    - **Save these somewhere safe!** You'll need them for GitHub Secrets in Step 7.

14. Click **"Finish"** button
    - This returns you to the Account API Tokens dashboard view
    - The token is already created at this point - the Finish button just closes the creation screen
    - You can verify your token exists by seeing it listed in the Account API Tokens dashboard

**⚠️ Keep these secret!** Treat them like passwords. Save them in a secure password manager or encrypted file - do NOT write them in this document or commit them to the repository.

---

### **STEP 6: Configure R2 Object Lifecycle Rules (Optional but Recommended)**

Set up automatic cleanup of old backups to save on storage costs.

**Note**: This is different from "Bucket Lock Rules" - we want **"Object Lifecycle Rules"** which automatically deletes old objects.

1. Navigate to your R2 bucket: In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"** → click your bucket name
2. Go to **"Settings"** tab
3. Scroll down to **"Object Lifecycle Rules"** section (not "Bucket Lock Rules")
4. Click the **"Add"** button to create a new lifecycle rule
5. Fill out the form:
   - **Rule name**: Enter `backup-retention-policy` (or any descriptive name)
   - **Rule scope**: 
     - **"Apply to objects with the following prefix (optional)"**: Leave this **empty** to apply to all objects in the bucket
     - If you want to target specific paths (e.g., only backups in a certain folder), enter a prefix like `backups/daily/`
     - For backups, leaving it empty (applying to all objects) is recommended
   - **Lifecycle action**: Select **"Delete uploaded objects after:"**
     - Enter **30** in the "Days" field (for daily backups)
     - This will automatically delete backups older than 30 days
   - **Optional actions** (you can leave these unchecked):
     - "Abort incomplete multipart uploads after:" - Leave default or set to 7 days
     - "Transition objects to Infrequent Access storage class after:" - Not needed for backups
6. Click **"Save changes"** button to create the rule

**Note**: You can create multiple rules if needed:
   - One rule for daily backups: Delete after 30 days
   - Another rule for weekly backups: Delete after 90 days (with prefix like `backups/weekly/`)
   - Another rule for monthly backups: Delete after 365 days (with prefix like `backups/monthly/`)

✅ This will automatically delete old backups and save you money!

---

### **STEP 7: Add GitHub Secrets**

You need to store your credentials securely in GitHub Secrets.

1. Go to your GitHub repository
2. Click **"Settings"** → **"Secrets and variables"** → **"Actions"**
3. Click **"New repository secret"** for each of these:

#### Add these 6 secrets:

**Secret 1:**
- **Name**: `RAILWAY_DATABASE_URL`
- **Value**: Your Railway PostgreSQL connection string
  - Get this from: Railway Dashboard → Your Database Service → **"Variables"** tab
  - Copy the `DATABASE_PUBLIC_URL` value (this is the external/public URL)
  - ⚠️ **Important**: Use `DATABASE_PUBLIC_URL` (not `DATABASE_URL` which is internal)
  - The `DATABASE_URL` variable is the internal URL and won't work from GitHub Actions
  - External URL looks like: `postgresql://postgres:password@crossover.proxy.rlwy.net:5432/railway`
  - Internal URL (`DATABASE_URL`) has `postgres.railway.internal` (won't work from GitHub Actions)

**Secret 2:**
- **Name**: `R2_ACCOUNT_ID`
- **Value**: Paste your Account ID from Step 4

**Secret 3:**
- **Name**: `R2_ACCESS_KEY_ID`
- **Value**: Paste your Access Key ID from Step 5

**Secret 4:**
- **Name**: `R2_SECRET_ACCESS_KEY`
- **Value**: Paste your Secret Access Key from Step 5

**Secret 5:**
- **Name**: `R2_BUCKET_NAME`
- **Value**: `business-advisor-database-backups` (or your bucket name from Step 3)

**Secret 6:**
- **Name**: `R2_ENDPOINT`
- **Value**: The S3 API endpoint URL from Cloudflare
  - Get this from: Cloudflare Dashboard → R2 Overview → **"Account Details"** section
  - Look for **"S3 API"** - it will show a URL like: `https://a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.r2.cloudflarestorage.com`
  - Copy the entire S3 API URL (this is your R2_ENDPOINT)
  - Example: `https://a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.r2.cloudflarestorage.com`
  - **Note**: Use the **default endpoint** (not jurisdiction-specific)
    - The default endpoint works perfectly for backups
    - Jurisdiction-specific endpoints are only needed for compliance requirements

4. ✅ All secrets are set!

---

### **STEP 8: Create GitHub Actions Workflow**

Now let's create the automated backup workflow.

1. In your GitHub repository, create the directory structure:
   ```bash
   mkdir -p .github/workflows
   ```

2. Create a new file: `.github/workflows/database-backup.yml`

3. Copy this workflow configuration:

```yaml
name: Daily Database Backup to R2

on:
  schedule:
    # Daily backup at 2:00 AM UTC (8:00 PM CST previous day)
    - cron: '0 2 * * *'
  workflow_dispatch: # Allows manual trigger from GitHub UI

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install PostgreSQL 17+ client
        shell: bash
        run: |
          set -euo pipefail
          
          sudo apt-get update
          sudo apt-get install -y wget ca-certificates lsb-release gnupg
          
          # Clean any preinstalled PG bits to avoid wrapper picking old defaults
          sudo apt-get remove -y postgresql-client postgresql-client-* postgresql-* postgresql-common postgresql-client-common 2>/dev/null || true
          
          # Remove any existing PostgreSQL repository to avoid conflicts
          sudo rm -f /etc/apt/sources.list.d/pgdg.list || true
          
          # Add PostgreSQL official APT repository
          # Import the repository signing key using modern method
          wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
          
          # Add repository with signed-by option
          echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
          
          # Update package lists
          sudo apt-get update
          
          # Try to install PostgreSQL 19, 18, or 17 client (in order of preference)
          # PostgreSQL 18+ clients can dump from PostgreSQL 17 servers
          if apt-cache show postgresql-client-19 >/dev/null 2>&1; then
            sudo apt-get install -y postgresql-client-19
            echo "✅ Installed PostgreSQL 19 client"
          elif apt-cache show postgresql-client-18 >/dev/null 2>&1; then
            sudo apt-get install -y postgresql-client-18
            echo "✅ Installed PostgreSQL 18 client"
          else
            sudo apt-get install -y postgresql-client-17
            echo "✅ Installed PostgreSQL 17 client"
          fi
          
          # Resolve the real binary dir (bypass /usr/bin/pg_dump -> pg_wrapper)
          # The actual binaries are in /usr/lib/postgresql/<version>/bin/
          PG_BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
          
          if [ -z "$PG_BIN" ]; then
            echo "❌ ERROR: Could not find PostgreSQL binary directory"
            echo "Searching for PostgreSQL binaries..."
            find /usr/lib/postgresql -type d -name bin 2>/dev/null || true
            exit 1
          fi
          
          echo "Using PG_BIN=$PG_BIN"
          
          # Export for future steps
          echo "$PG_BIN" >> "$GITHUB_PATH"
          echo "PG_BIN=$PG_BIN" >> "$GITHUB_ENV"
          
          # Export PATH in THIS step so verification uses the real binary
          export PATH="$PG_BIN:$PATH"
          echo "PATH now: $PATH"
          
          # Verify the actual binary exists and is executable
          PG_DUMP="$PG_BIN/pg_dump"
          
          if [ ! -x "$PG_DUMP" ]; then
            echo "❌ ERROR: Real pg_dump not found at $PG_DUMP"
            ls -la "$PG_BIN" || echo "Could not list $PG_BIN"
            exit 1
          fi
          
          echo "✅ Found real pg_dump at: $PG_DUMP"
          
          # Verify version (this calls the real binary, not pg_wrapper)
          echo "Verifying pg_dump version:"
          "$PG_DUMP" --version
          
          # Extract and verify version
          PG_VERSION_OUTPUT=$("$PG_DUMP" --version)
          PG_VERSION=$(echo "$PG_VERSION_OUTPUT" | grep -oE '[0-9]+' | head -1)
          
          if [ -z "$PG_VERSION" ] || [ "$PG_VERSION" -lt 17 ]; then
            echo "❌ ERROR: Installed pg_dump version is $PG_VERSION, but need 17 or higher"
            echo "Version output: $PG_VERSION_OUTPUT"
            exit 1
          fi
          
          echo "✅ pg_dump version check passed (version $PG_VERSION)"
          
          # Verify PATH resolution uses the real binary (not wrapper)
          echo "Verifying PATH resolution:"
          command -v pg_dump
          pg_dump --version
          
          # Verify major version from PATH-resolved pg_dump
          PG_MAJOR=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
          if [ -z "$PG_MAJOR" ] || [ "$PG_MAJOR" -lt 17 ]; then
            echo "❌ ERROR: PATH-resolved pg_dump major=$PG_MAJOR, need >=17"
            exit 1
          fi
          
          echo "✅ pg_dump major $PG_MAJOR ready"

      - name: Configure AWS CLI for R2
        env:
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
        run: |
          # Check if AWS CLI is already installed (GitHub Actions runners have it pre-installed)
          if command -v aws &> /dev/null; then
            echo "✅ AWS CLI already installed"
            aws --version
          else
            echo "Installing AWS CLI..."
            curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
            unzip awscliv2.zip
            sudo ./aws/install
            rm -rf aws awscliv2.zip
            aws --version
          fi
          
          # Configure AWS CLI with R2 credentials
          mkdir -p ~/.aws
          cat > ~/.aws/credentials << EOF
          [default]
          aws_access_key_id = ${R2_ACCESS_KEY_ID}
          aws_secret_access_key = ${R2_SECRET_ACCESS_KEY}
          EOF

      - name: Create database backup
        env:
          # Optional: force script to use exact binary (avoids pg_wrapper)
          PG_DUMP: ${{ env.PG_BIN }}/pg_dump
          PG_BIN: ${{ env.PG_BIN }}
          DATABASE_URL: ${{ secrets.RAILWAY_DATABASE_URL }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: |
          set -e  # Exit on error
          
          TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
          YEAR=$(date +"%Y")
          MONTH=$(date +"%m")
          BACKUP_FILE="backup-${TIMESTAMP}.sql"
          BACKUP_PATH="backups/${YEAR}/${MONTH}/${BACKUP_FILE}"
          
          echo "📦 Creating database backup..."
          
          # Verify DATABASE_URL is set
          if [ -z "$DATABASE_URL" ]; then
            echo "❌ DATABASE_URL is not set!"
            exit 1
          fi
          
          # Verify pg_dump is available (from GITHUB_PATH or via PG_DUMP env var)
          echo "Using pg_dump at: $(command -v pg_dump || echo $PG_DUMP)"
          if [ -n "$PG_DUMP" ] && [ -x "$PG_DUMP" ]; then
            "$PG_DUMP" --version
            PG_DUMP_CMD="$PG_DUMP"
          else
            pg_dump --version
            PG_DUMP_CMD="pg_dump"
          fi
          
          echo "Creating backup from: $(echo $DATABASE_URL | sed 's/:[^:]*@/:***@/')"
          
          # Create backup with error output to separate file
          if ! "$PG_DUMP_CMD" "$DATABASE_URL" \
            --no-owner \
            --no-acl \
            --clean \
            --if-exists \
            --verbose \
            > "$BACKUP_FILE" 2>backup_error.log; then
            echo "❌ Database backup failed!"
            echo "Error details:"
            cat backup_error.log
            echo ""
            echo "Troubleshooting:"
            echo "- Check that RAILWAY_DATABASE_URL secret is set correctly"
            echo "- Verify the database URL is the EXTERNAL URL (DATABASE_PUBLIC_URL, not DATABASE_URL which is internal)"
            echo "- Ensure the database allows connections from GitHub Actions IPs"
            exit 1
          fi
          
          # Check for warnings even if command succeeded
          if [ -s backup_error.log ]; then
            echo "⚠️ Warnings during backup:"
            cat backup_error.log
          fi
          rm -f backup_error.log
          
          # Check if backup file was created and has content
          if [ ! -s "$BACKUP_FILE" ]; then
            echo "❌ Backup file is empty!"
            exit 1
          fi
          
          ORIGINAL_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE")
          echo "📊 Original backup size: $(numfmt --to=iec-i --suffix=B $ORIGINAL_SIZE)"
          
          echo "🗜️ Compressing backup..."
          gzip "$BACKUP_FILE"
          COMPRESSED_FILE="${BACKUP_FILE}.gz"
          
          COMPRESSED_SIZE=$(stat -f%z "$COMPRESSED_FILE" 2>/dev/null || stat -c%s "$COMPRESSED_FILE")
          COMPRESSION_RATIO=$(echo "scale=1; (1 - $COMPRESSED_SIZE / $ORIGINAL_SIZE) * 100" | bc)
          echo "📊 Compressed size: $(numfmt --to=iec-i --suffix=B $COMPRESSED_SIZE)"
          echo "📊 Compression ratio: ${COMPRESSION_RATIO}%"
          
          echo "☁️ Uploading to Cloudflare R2..."
          ENDPOINT_URL="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
          
          if ! aws s3 cp "$COMPRESSED_FILE" \
            "s3://${R2_BUCKET_NAME}/${BACKUP_PATH}" \
            --endpoint-url="$ENDPOINT_URL" \
            --region auto \
            --metadata "backup-date=${TIMESTAMP},database=railway,original-size=${ORIGINAL_SIZE}"; then
            echo "❌ Upload to R2 failed!"
            exit 1
          fi
          
          echo "✅ Backup uploaded successfully!"
          echo "📍 Location: s3://${R2_BUCKET_NAME}/${BACKUP_PATH}"
          
          # Verify upload
          echo "🔍 Verifying upload..."
          if aws s3 ls "s3://${R2_BUCKET_NAME}/${BACKUP_PATH}" \
            --endpoint-url="$ENDPOINT_URL" \
            --region auto > /dev/null 2>&1; then
            echo "✅ Upload verification successful"
          else
            echo "❌ Upload verification failed!"
            exit 1
          fi
          
          # Clean up
          rm -f "$COMPRESSED_FILE"
          echo "🧹 Cleanup complete"

      - name: Backup summary
        if: always()
        run: |
          echo "## Backup Summary" >> $GITHUB_STEP_SUMMARY
          if [ "${{ job.status }}" == "success" ]; then
            echo "✅ Database backup completed successfully!" >> $GITHUB_STEP_SUMMARY
            echo "- Backup uploaded to Cloudflare R2" >> $GITHUB_STEP_SUMMARY
            echo "- Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")" >> $GITHUB_STEP_SUMMARY
          else
            echo "❌ Database backup failed!" >> $GITHUB_STEP_SUMMARY
            echo "Check the logs above for error details." >> $GITHUB_STEP_SUMMARY
          fi
```

4. Save the file and commit it to your repository:
   ```bash
   git add .github/workflows/database-backup.yml
   git commit -m "Add automated daily database backup workflow"
   git push
   ```

---

### **STEP 9: Test the Workflow**

Let's test the backup workflow to make sure everything works!

1. Go to your GitHub repository → **"Actions"** tab
2. You should see **"Daily Database Backup to R2"** workflow listed
3. Click on the workflow name
4. Click **"Run workflow"** dropdown button (top right)
5. Select **"Run workflow"** to trigger it manually
6. Wait for the workflow to complete (usually 2-5 minutes)
7. Check the logs:
   - ✅ Green checkmark = Success!
   - ❌ Red X = Error (check logs for details)

**What to look for in the logs:**
- ✅ "Creating database backup..."
- ✅ "Compressing backup..."
- ✅ "Uploading to Cloudflare R2..."
- ✅ "Backup uploaded successfully!"
- ✅ "Upload verification successful"

---

### **STEP 10: Verify Backup in R2**

Let's confirm the backup was uploaded successfully!

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"**
3. Click your bucket: `business-advisor-database-backups`
4. Navigate to: `backups/YYYY/MM/` (where YYYY is current year, MM is current month)
5. You should see a file like: `backup-2025-01-21-020000.sql.gz`
6. ✅ Your backup is there!

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Cloudflare account created
- [ ] R2 enabled on account
- [ ] Bucket created (`business-advisor-database-backups`)
- [ ] Account ID copied
- [ ] API token created (Access Key ID + Secret Access Key saved)
- [ ] Lifecycle rules configured (optional)
- [ ] All 6 GitHub Secrets added
- [ ] GitHub Actions workflow file created
- [ ] Test backup ran successfully
- [ ] Backup visible in R2 bucket (check Cloudflare dashboard)
- [ ] Workflow scheduled to run daily at 2 AM UTC

---

## 🔍 How to Check Your Backups

### View Backups in Cloudflare:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the left sidebar, expand **"Storage & databases"** → expand **"R2 object storage"** → click **"Overview"**
3. Click your bucket: `business-advisor-database-backups`
4. Navigate through the folder structure: `backups/YYYY/MM/`
5. You'll see all your backup files listed!

### Download a Backup:

1. In your R2 bucket, click on a backup file
2. Click **"Download"** button
3. The file will download to your computer (it's a `.sql.gz` file)

### Restore from Backup:

If you need to restore your database:

1. **Download the backup file** from R2 (as above)
2. **Decompress it**:
   ```bash
   gunzip backup-YYYY-MM-DD-HHMMSS.sql.gz
   ```
3. **Restore to your database**:
   ```bash
   psql $DATABASE_URL < backup-YYYY-MM-DD-HHMMSS.sql
   ```
   Or if using Railway CLI:
   ```bash
   railway run psql < backup-YYYY-MM-DD-HHMMSS.sql
   ```

---

## 🆘 Troubleshooting

### Problem: "RAILWAY_DATABASE_URL not set" or "Database connection failed"

**Solution**: 
1. Check that `RAILWAY_DATABASE_URL` secret is set in GitHub
2. Make sure you're using `DATABASE_PUBLIC_URL` from Railway (not `DATABASE_URL` which is internal)
3. Get the public URL from: Railway Dashboard → Database → **"Variables"** tab → look for `DATABASE_PUBLIC_URL`
4. The public URL should have a hostname like `crossover.proxy.rlwy.net` (not `postgres.railway.internal`)

### Problem: "R2 Access Denied" error

**Solution**: 
1. Check your API token has "Object Read & Write" permissions
2. Make sure the bucket name matches in both the token and `R2_BUCKET_NAME` secret
3. Verify `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are correct
4. Try creating a new API token

### Problem: "Cannot find module" or AWS CLI errors

**Solution**: 
- The workflow installs AWS CLI automatically, but if it fails:
- Check the workflow logs for installation errors
- Make sure the workflow is using `ubuntu-latest` runner

### Problem: Workflow not running automatically

**Solution**:
1. Check the workflow schedule is correct: `0 2 * * *` (daily at 2 AM UTC)
2. Make sure the workflow file is in `.github/workflows/` directory
3. Verify the workflow file is committed and pushed to your repository
4. GitHub Actions may take a few minutes to recognize new scheduled workflows

### Problem: Backup file is empty

**Solution**:
1. Check that your database has data
2. Verify `DATABASE_URL` is correct and accessible
3. Check Railway logs to ensure database is running
4. Test database connection manually: `psql $DATABASE_URL`

### Problem: Upload verification fails

**Solution**:
1. Check R2 bucket name matches exactly
2. Verify R2 credentials are correct
3. Check Cloudflare R2 dashboard for any service issues
4. Ensure bucket exists and is accessible

---

## 💰 Cost Estimate

Cloudflare R2 pricing (as of 2024):
- **First 10 GB**: FREE
- **After 10 GB**: ~$0.015 per GB/month
- **Downloading backups**: FREE (no egress fees!)
- **Operations**: Minimal cost (API calls are very cheap)

**Example costs:**
- 5 GB of backups = **FREE** (within free tier)
- 20 GB of backups = ~$0.15/month
- 50 GB of backups = ~$0.60/month

**With compression (gzip):**
- Typical database backups compress to 20-30% of original size
- A 10 GB database might compress to 2-3 GB
- This means you can store much more within the free tier!

**Very affordable!** 🎉

---

## 📊 Backup Schedule Details

Your backups will run:
- **Daily**: Every day at 2:00 AM UTC (8:00 PM CST previous day)
- **Manual**: You can trigger backups anytime from GitHub Actions tab
- **Retention**: 
  - Daily backups retained for 30 days (via lifecycle rules)
  - You can adjust retention in R2 bucket settings

**To change the schedule:**
- Edit `.github/workflows/database-backup.yml`
- Modify the cron expression: `0 2 * * *`
- Cron format: `minute hour day month weekday`
- Examples:
  - `0 2 * * *` = Daily at 2 AM UTC
  - `0 2 * * 0` = Weekly on Sunday at 2 AM UTC
  - `0 2 1 * *` = Monthly on 1st at 2 AM UTC

---

## 🔒 Security Best Practices

1. **Never commit secrets**: All credentials are stored in GitHub Secrets
2. **Rotate API keys**: Change R2 API tokens every 90 days
3. **Limit permissions**: API token only has access to backup bucket
4. **Monitor access**: Check R2 access logs regularly
5. **Backup encryption**: R2 provides encryption at rest automatically
6. **Audit backups**: Review backup logs in GitHub Actions regularly

---

## 📈 Monitoring & Alerts

### Check Backup Status:

1. **GitHub Actions**: Go to repository → Actions tab → Check workflow runs
2. **R2 Dashboard**: Navigate to R2 Overview (expand **"Storage & databases"** → **"R2 object storage"** → **"Overview"**) and check bucket for new backup files
3. **Workflow Logs**: Click on any workflow run to see detailed logs

### Set Up Notifications (Optional):

You can add email/Slack notifications to the workflow:

```yaml
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Database backup failed!'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 🎯 Next Steps

After completing this setup:

1. ✅ **Monitor first few backups** - Check that they run successfully
2. ✅ **Test restore process** - Download a backup and test restoring it
3. ✅ **Set up alerts** - Configure notifications for backup failures
4. ✅ **Document restore procedure** - Keep restore steps documented for your team
5. ✅ **Review retention policy** - Adjust lifecycle rules based on your needs

---

## 📞 Need Help?

If you get stuck:

1. **Check the error message** carefully in GitHub Actions logs
2. **Verify all secrets** are set correctly in GitHub
3. **Test database connection** manually with `psql`
4. **Check R2 bucket** exists and is accessible
5. **Review this guide** step-by-step to ensure nothing was missed

**Common issues:**
- Database URL must be `DATABASE_PUBLIC_URL` (not `DATABASE_URL` which is internal)
- R2 credentials must match exactly
- Workflow file must be in correct location (`.github/workflows/`)
- All secrets must be set before running workflow

---

## 🎉 You're Done!

Your AI Business Advisor database will now automatically backup to Cloudflare R2 every day at 2:00 AM UTC. Your data is safe! 🛡️

**What happens next:**
- ✅ Backups run automatically every day
- ✅ Backups are compressed and uploaded to R2
- ✅ Old backups are automatically deleted after 30 days
- ✅ You can restore from any backup if needed
- ✅ All backups are encrypted at rest

**Remember to:**
- Monitor backup success in GitHub Actions
- Test restore procedure periodically
- Review storage costs in Cloudflare dashboard
- Rotate API keys every 90 days

---

## 📚 Quick Reference

### Manual Backup Trigger

To trigger a backup manually:
1. Go to GitHub repository → Actions tab
2. Click "Daily Database Backup to R2"
3. Click "Run workflow" → "Run workflow"

### Backup File Format

Backups are stored as:
- **Path**: `backups/YYYY/MM/backup-YYYY-MM-DD-HHMMSS.sql.gz`
- **Format**: Compressed SQL dump (gzip)
- **Example**: `backups/2025/01/backup-2025-01-21-020000.sql.gz`

### Required GitHub Secrets

- `RAILWAY_DATABASE_URL` - External PostgreSQL connection string (use `DATABASE_PUBLIC_URL` from Railway)
- `R2_ACCOUNT_ID` - Cloudflare Account ID
- `R2_ACCESS_KEY_ID` - R2 Access Key ID
- `R2_SECRET_ACCESS_KEY` - R2 Secret Access Key
- `R2_BUCKET_NAME` - R2 bucket name
- `R2_ENDPOINT` - R2 endpoint URL

### Useful Commands

**Check backup file size:**
```bash
aws s3 ls s3://business-advisor-database-backups/backups/2025/01/ \
  --endpoint-url=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

**Download latest backup:**
```bash
aws s3 cp s3://business-advisor-database-backups/backups/2025/01/backup-2025-01-21-020000.sql.gz ./ \
  --endpoint-url=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

---

**Last Updated**: August 2026  
**Project**: AI Business Advisor (business-advisor)  
**Database**: PostgreSQL on Railway  
**Backup Storage**: Cloudflare R2

