# SABHA: 5-minute demo script

**Before recording**
- Run `python -m scripts.seed` (clean memories, weights back to 1.0), then `python run.py`.
- Paste the printed webhook URLs into the **Omi app → Developer Settings** (Realtime transcript + Conversation events; Day summary optional), and check that `OMI_API_KEY` is set.
- Open `http://localhost:8765` (landing page) in Chrome and keep `/council` open in a second tab. Click **Enter the Sabha**, set speed to about **1.3**, and keep the Omi app open on your phone.
- Screen layout: browser full-screen, with your phone mirrored (or held up to the camera) in a corner.
- Backup: if the phone or tunnel fails at any point, use the **Demo tools** (flask button next to the input) to replay Omi webhooks. Each step below lists its scenario.

---

### 0:00–0:25 · Hook
> "Big decisions get made with whatever we remember in the moment. SABHA remembers everything I've said for weeks,
> and lets a council of AI advisors argue over it, in my own words."

Start on the **landing page** (the 3D council turns behind the title; the live stats show memories in Qdrant Cloud and
Lyzr agents online). Click **Enter the council**. Show the round table, the Omi phone panel, and the **Omi Link** pill.

### 0:25–1:10 · Memories arrive from the phone *(backup: `memories`)*
Open the Omi app and talk naturally:
> "So I had a call with Meera from the startup today. She said I'd own the whole battery dashboard from day one…
> but I'm worried the MNC salary is the only way to clear my loan… My landlord's number is 91234 56789…"

Point out:
- **Omi Link** turns **live** and the phone panel streams your words.
- Toasts show each sentence labelled (FACT, FEAR…) and saved to **Qdrant**.
- The phone number shows as **[REDACTED]**.
- In the **Memories** tab: 40 seeded memories over 3 weeks, plus the new ones. Type "loan" into the semantic search.
- Point at the 🔒 **sealed** memory.
- Click **Constellation**. Your memories appear as a 3D star map of Qdrant vectors, with fears clustered together and
  values clustered together. Type "money" and the matching stars light up. Press Esc.

### 1:10–1:25 · Ask by voice *(backup: `question`)*
> "**Sabha, should I join the startup or the MNC offer?**"

The Moderator frames it: Startup vs MNC, "your lean: Startup".

### 1:25–2:40 · The advisors debate aloud
- Each advisor glows and speaks in its own voice while the rest dim. Its text types out in a bubble.
- **Memory cards float up** with the exact date ("On Sep 21 you said…").
- Mention the Skeptic arguing *against* your favourite, and Future-You using only goals you actually said.
- **Bias Radar** sweeps and flags *Social proof* (relatives) and the *money-doesn't-matter vs loan-worry* conflict.
- Open **📜 Agent log**: each Lyzr call with latency, marked `LYZR`.

### 2:40–3:05 · Interrupt *(backup: `interrupt`)*
During the "Round 2 in 15s" countdown:
> "**Sabha, I also care about staying close to my parents in Bengaluru.**"

The **YOU** seat flashes and the thought is saved as a value. The Moderator: "*You've added something new…*". Then say
"**Sabha, next round**". Round 2 advisors reply to each other (**animated lines** between orbs) and weigh what you just said.

### 3:05–3:45 · Vote and verdict
- Vote tokens fly into the **vote ring**, each worth *weight × confidence*.
- The **verdict scroll unrolls**, and the Scribe reads the verdict, the dissent and one action item.
- Point at the **Tipping point** line, e.g. "If the Strategist switched to MNC, MNC would win." Then open the
  **Constellation** again: the memories the advisors cited now have white halos.

### 3:45–4:15 · Verdict lands in the Omi app
The scroll shows **✅ Saved to your Omi app**. On the phone, open Omi → Memories and find "SABHA verdict…". Then open
the **action items** to find the next step the Scribe wrote.

### 4:15–4:50 · Outcome learning *(backup: `outcome`, then `track`)*
> "A few weeks later…" **"Sabha, the startup decision went well."**

The **⚖️ Weights** drawer opens and the bars animate. Advisors who voted Startup get **▲**, the others **▼**, and
the orbs grow or shrink. Then:
> "**Sabha, show my track record.**"

*(Optional, 10 s: Demo tools → **Omi day summary**. Omi's nightly recap turns into memories: decisions become past
decisions, and open questions become plans.)*

### 4:50–5:00 · Close
> "Omi listens, Qdrant remembers, Lyzr's council argues, and it gets wiser every time I tell it how things turned out.
> SABHA: a council of your own words."
