# Deploying SABHA

SABHA is a **long-running server**. It holds WebSocket connections, runs debates in the background, and keeps live
state in memory. That rules out serverless hosts (Vercel, Netlify functions). Use any host that runs a
**Docker container** and supports **WebSockets**. The repo includes a ready `Dockerfile`, which listens on port
`7860`, bakes in the embedding model, and disables the tunnel.

| Host | Cost | RAM | Sleeps? | Notes |
|---|---|---|---|---|
| **Hugging Face Spaces** (recommended) | Free | 16 GB | after 48 h idle | Docker Space, public HTTPS URL, WebSockets OK |
| Railway | Trial credit, then usage-based | up to 8 GB | no | Deploys straight from GitHub |
| Render | Free / paid | 512 MB (free) | free tier after 15 min | Free tier is tight on RAM; use a paid tier (≥1 GB) |
| Any VM (EC2, GCP, Azure, DigitalOcean) | varies | ≥1 GB | no | `docker run`, put HTTPS in front |

## Before you deploy (all hosts)

1. **Use Qdrant Cloud.** Container disks are temporary, so the embedded Qdrant would lose your memories on every
   restart. Set `QDRANT_URL` and `QDRANT_API_KEY`.
2. **Reuse your Lyzr agents.** Otherwise every restart creates 8 new agents, and the free plan allows only 10. Copy the
   ids from your local `data/lyzr_agents.json` into these variables:
   `LYZR_AGENT_MODERATOR`, `LYZR_AGENT_MENTOR`, `LYZR_AGENT_SKEPTIC`, `LYZR_AGENT_FUTURE_YOU`,
   `LYZR_AGENT_STRATEGIST`, `LYZR_AGENT_GUARDIAN`, `LYZR_AGENT_BIAS_RADAR`, `LYZR_AGENT_SCRIBE`.
3. **Set `PUBLIC_URL`** to your deployed URL (e.g. `https://yourname-sabha.hf.space`), so the Connect Omi dialog
   shows the right webhook URLs.
4. **Recommended:** set `SABHA_WEBHOOK_KEY` to a random string. The webhook URLs then need `?key=…`, which blocks
   strangers from posting fake speech to your public server.

### Environment variables

| Variable | Secret? | Value |
|---|---|---|
| `LYZR_API_KEY` | ✅ | your Lyzr key |
| `OMI_API_KEY` | ✅ | your `omi_dev_…` key |
| `QDRANT_URL` | ✅ | `https://…cloud.qdrant.io` |
| `QDRANT_API_KEY` | ✅ | your Qdrant key |
| `SABHA_WEBHOOK_KEY` | ✅ | optional random string |
| `LYZR_AGENT_*` (8) | – | ids from `data/lyzr_agents.json` |
| `PUBLIC_URL` | – | your deployed https URL |
| `SABHA_USER_NAME` | – | optional |

`PORT` (7860) and `TUNNEL=none` are already set in the Dockerfile. Railway and Render inject their own `PORT`,
and SABHA follows it.

---

## Option A: Hugging Face Spaces (free, recommended)

1. Go to <https://huggingface.co/new-space>:
   - **Space name:** `sabha`
   - **SDK:** Docker → Blank
   - **Hardware:** CPU basic (free)
   - **Visibility:** **Public**. Omi's webhooks can't send HF auth headers, so a private Space won't receive them.
2. In the Space, open **Settings → Variables and secrets** and add every variable from the table above:
   - Keys as **Secrets**, everything else as **Variables**.
   - `PUBLIC_URL` = `https://<your-hf-username>-sabha.hf.space`
3. Create an access token with **write** access at <https://huggingface.co/settings/tokens>.
4. Push the code from your project folder (PowerShell). Spaces needs a small config header in `README.md`, and it
   rejects binary files (the screenshots) that aren't stored with LFS. So you push a separate `hf` branch that adds
   the header and drops `docs/`:

   ```powershell
   git checkout -b hf
   $header = "---`ntitle: SABHA`nemoji: 🪔`ncolorFrom: yellow`ncolorTo: red`nsdk: docker`napp_port: 7860`npinned: false`n---`n`n"
   Set-Content README.md -Value ($header + (Get-Content README.md -Raw)) -Encoding utf8
   git rm -r --cached docs -q
   git commit -am "Hugging Face Space config"
   git remote add space https://huggingface.co/spaces/<your-hf-username>/sabha
   git push space hf:main --force      # username = HF username, password = the write token
   git checkout main
   ```

5. Watch the **Logs** tab. The first build takes about 3–5 minutes. When it shows `SABHA is running`, open:
   - `https://<your-hf-username>-sabha.hf.space` (landing page)
   - `https://<your-hf-username>-sabha.hf.space/council` (the app)
6. In the Omi app → Developer Settings, paste the URLs:
   - Realtime transcript → `https://<your-hf-username>-sabha.hf.space/omi/realtime`
   - Conversation events → `https://<your-hf-username>-sabha.hf.space/omi/memory-created`
   - Day summary (optional) → `https://<your-hf-username>-sabha.hf.space/omi/day-summary`
   - If you set `SABHA_WEBHOOK_KEY`, append `?key=<value>` to each.

   Unlike the local tunnel, these URLs **never change**.

To redeploy after changes: `git checkout hf`, `git merge main`, `git push space hf:main`, `git checkout main`.

---

## Option B: Railway

1. Go to <https://railway.app> → **New Project → Deploy from GitHub repo** and pick
   `SABHA-a-council-of-your-own-words`. Railway detects the `Dockerfile` automatically.
2. In the service's **Variables** tab, add everything from the table above.
3. Go to **Settings → Networking → Generate Domain**. Set `PUBLIC_URL` to that `https://….up.railway.app`
   domain and redeploy.
4. Paste `<domain>/omi/realtime`, `<domain>/omi/memory-created` and `<domain>/omi/day-summary` into the Omi app.

Every `git push` to `main` redeploys automatically.

---

## Option C: Render

1. Go to <https://render.com> → **New → Web Service**, connect the GitHub repo, and choose **Runtime: Docker**.
2. **Instance type:** pick one with at least 1 GB RAM. The free 512 MB tier can run out of memory while loading the
   embedding model, and it sleeps after 15 minutes idle.
3. Add the environment variables, including `PUBLIC_URL=https://<service>.onrender.com`.
4. Deploy, then paste the webhook URLs into the Omi app.

---

## Option D: Any VM with Docker

```bash
git clone https://github.com/yadavahc/SABHA-a-council-of-your-own-words.git && cd SABHA-a-council-of-your-own-words
cp .env.example .env        # fill in keys, QDRANT_URL, LYZR_AGENT_* ids, PUBLIC_URL, TUNNEL=none
docker build -t sabha .
docker run -d --restart unless-stopped --name sabha -p 80:7860 --env-file .env -e PORT=7860 sabha
```

Put HTTPS in front with Caddy (`caddy reverse-proxy --from your.domain --to localhost:80`), or use Cloudflare.
Omi needs an **https** webhook URL, and the browser mic only works over https.

---

## After deploying: checklist

- [ ] `https://<url>/health` returns `{"ok":true,"memories":40,"lyzr":"online"}`
- [ ] `/council` shows **Lyzr online** and **Qdrant cloud** in the header
- [ ] The log does **not** say `Created Lyzr agent` (that would mean the `LYZR_AGENT_*` ids are missing)
- [ ] Talking in the Omi app turns the **Omi Link** pill green
- [ ] A test debate ends with "✅ Saved to your Omi app"
- [ ] Before the demo: **Demo tools → Reset demo data** for a clean 40-memory state

## Security note

A public deployment exposes the UI and `/api/*` endpoints to anyone who has the URL, including **Reset demo data**.
That's fine for a hackathon demo, but don't share the URL publicly with real personal memories in it.
