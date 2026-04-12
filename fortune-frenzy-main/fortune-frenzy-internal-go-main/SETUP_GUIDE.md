# Fortune Frenzy External Backend - Setup Guide

Follow these steps exactly to deploy your backend.

---

## Step 1: Buy a Domain (~$2/year)

1. Go to https://www.namecheap.com
2. Search for a cheap domain (e.g. `fortunefrenzy.xyz` or anything `.xyz`)
3. Buy it -- `.xyz` domains are usually $1-2/year
4. **Don't set up DNS on Namecheap** -- we'll use Cloudflare for that

---

## Step 2: Set Up Cloudflare (Free)

1. Go to https://dash.cloudflare.com and create a free account
2. Click "Add a site" and enter your domain name
3. Select the **Free** plan
4. Cloudflare will give you two nameservers (e.g. `ada.ns.cloudflare.com`)
5. Go back to Namecheap > Domain List > click your domain > Nameservers
6. Change from "Namecheap BasicDNS" to "Custom DNS"
7. Enter the two Cloudflare nameservers
8. Wait 5-30 minutes for DNS to propagate

---

## Step 3: Rent a Server on Hetzner (~$5/month)

1. Go to https://www.hetzner.com/cloud
2. Create an account
3. Create a new project called "Fortune Frenzy"
4. Click "Add Server"
5. Settings:
   - **Location**: Choose the closest to your players (Ashburn for US, Falkenstein for EU)
   - **Image**: Ubuntu 24.04
   - **Type**: Shared vCPU > **CX22** (2 vCPU, 4GB RAM) -- 4.51 EUR/month
   - **SSH Key**: Click "Add SSH key" -- if you don't have one, run this in your Mac terminal:
     ```
     ssh-keygen -t ed25519
     cat ~/.ssh/id_ed25519.pub
     ```
     Copy the output and paste it into Hetzner
   - **Name**: `fortune-frenzy`
6. Click "Create & Buy Now"
7. Copy the **IP address** it shows you

---

## Step 4: Point Domain to Server

1. Go to Cloudflare dashboard > your domain > DNS
2. Add an **A record**:
   - **Name**: `api`
   - **IPv4 address**: (paste your Hetzner server IP)
   - **Proxy status**: Turn OFF the orange cloud (DNS only -- gray cloud)
   - This is important! Caddy needs direct access for SSL certificates
3. Your API will be at `https://api.yourdomain.xyz`

---

## Step 5: Connect to Your Server

Open your Mac terminal and run:
```bash
ssh root@YOUR_SERVER_IP
```

If it asks about fingerprint, type `yes`.

---

## Step 6: Install Docker on the Server

Run these commands one by one on the server:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

---

## Step 7: Upload Your Code

From your **Mac terminal** (not the server), run:

```bash
# Copy the Go backend to the server
scp -r /path/to/Fortune-frenzy/fortune-frenzy-main/fortune-frenzy-internal-go-main root@YOUR_SERVER_IP:/root/fortune-frenzy
```

Replace `/path/to/Fortune-frenzy` with the actual path on your Mac.

---

## Step 8: Configure Environment Variables

On the server:

```bash
cd /root/fortune-frenzy

# Copy the example env file
cp .env.example .env

# Edit it with your own passwords
nano .env
```

Change ALL the `CHANGE_ME_*` values to random strings. You can generate them with:
```bash
openssl rand -hex 32
```

Set `DOMAIN` to your actual domain (e.g. `api.fortunefrenzy.xyz`).

Save and exit nano: `Ctrl+X`, then `Y`, then `Enter`.

---

## Step 9: Caddyfile and domain

The `Caddyfile` uses `{$DOMAIN}`. **Docker Compose loads `.env` into the Caddy container**, so if `DOMAIN=api.yourdomain.xyz` is set in `.env` (Step 8), you usually **do not** need to edit the Caddyfile.

Optional: you can instead hardcode the hostname in `Caddyfile` (no env needed):

```
api.yourdomain.xyz {
    reverse_proxy ff-api:3004
    ...
}
```

---

## Step 10: Deploy

```bash
docker compose up -d --build
```

This will:
- Build the Go application
- Start MariaDB (and run the schema migration automatically)
- Start Redis
- Start Caddy (which auto-obtains an SSL certificate)

Wait about 30 seconds, then check:

```bash
# Check all containers are running
docker compose ps

# Check the API is responding
curl https://api.yourdomain.xyz/health
```

You should see `{"status":"ok"}`.

---

## Step 11: Connect Roblox to the Backend

In Roblox Studio:

1. Go to **Game Settings > Security > Allow HTTP Requests** (must be enabled)
2. Go to **Game Settings > Security > API Services** and enable them
3. Open the **Secrets** manager in Studio and add a secret called `X_API_KEY` with a random string value (at least 32 characters)
4. In your Roblox place, set a ReplicatedStorage attribute:
   - **Name**: `_backend_url`
   - **Type**: String
   - **Value**: `https://api.yourdomain.xyz`

The game will now connect to your external backend instead of using local-backend.

---

## Useful Commands

```bash
# View logs
docker compose logs -f ff-api

# Restart everything
docker compose restart

# Rebuild after code changes
docker compose up -d --build

# Stop everything
docker compose down

# Connect to the database
docker compose exec mariadb mysql -u fortunefrenzy -p Game1

# Connect to Redis
docker compose exec redis redis-cli -a YOUR_REDIS_PASSWORD
```

---

## Troubleshooting

**"Cannot connect" from Roblox:**
- Make sure the Cloudflare proxy is OFF (gray cloud, not orange)
- Make sure `HttpService.HttpEnabled` is true in Studio
- Check the API key secret name matches exactly: `X_API_KEY`

**"SSL certificate error":**
- Make sure the domain DNS is pointing to the correct IP
- Wait a few minutes for Caddy to obtain the certificate
- Check: `docker compose logs caddy`

**Server runs out of memory:**
- Check: `docker stats`
- If MariaDB uses too much, add to docker-compose.yml under mariadb:
  ```yaml
  deploy:
    resources:
      limits:
        memory: 1G
  ```

**Updating the code:**
```bash
# On your Mac, re-upload:
scp -r /Users/52hofand/Downloads/Fortune-frenzy/fortune-frenzy-main/fortune-frenzy-internal-go-main root@87.99.145.202:/root/fortune-frenzy

# On the server:
cd /root/fortune-frenzy
docker compose up -d --build
```
