# Long Night — Setup pro nového developera

Krok po kroku jak nastavit projekt na novem PC.

---

## 1. Nainstaluj Node.js

Stahni a nainstaluj z: https://nodejs.org/ (LTS verze)

Po instalaci over v terminalu:
```bash
node --version
```

---

## 2. Nainstaluj Bun (package manager)

```bash
curl -fsSL https://bun.sh/install | bash
```

Restartuj terminal, pak over:
```bash
bun --version
```

---

## 3. Nainstaluj Git

**Mac:**
```bash
xcode-select --install
```

**Windows:**
Stahni z: https://git-scm.com/downloads

Over:
```bash
git --version
```

---

## 4. Nainstaluj Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Pak spust:
```bash
claude
```

Pri prvnim spusteni se prihlasis pres Anthropic ucet (potrebujes Max plan nebo API klic).

---

## 5. Nastav pristup ke GitHubu

Jakub ti musi pridat jako collaboratora:
- GitHub repo: https://github.com/liftykreatincz/LongNight1
- Settings > Collaborators > Add people > zadej tvuj GitHub username nebo email

Prijmi pozvanku co ti prijde na email.

### Nastav SSH klic (doporuceno):

```bash
ssh-keygen -t ed25519 -C "tvuj@email.com"
```

Stiskni Enter na vsechny otazky (vychozi cesta, bez hesla).

Zkopiruj klic:
```bash
# Mac:
cat ~/.ssh/id_ed25519.pub | pbcopy

# Windows (Git Bash):
cat ~/.ssh/id_ed25519.pub | clip
```

Pridej ho na GitHub:
1. Jdi na https://github.com/settings/keys
2. Klikni "New SSH key"
3. Vloz zkopirovanej klic
4. Uloz

---

## 6. Naklonuj projekt

```bash
cd ~/Desktop
git clone git@github.com:liftykreatincz/LongNight1.git
cd LongNight1
```

---

## 7. Nainstaluj zavislosti

```bash
bun install
```

---

## 8. Vytvor .env.local

V korenovem adresari projektu vytvor soubor `.env.local`:

```bash
touch .env.local
```

Otevri ho v editoru a vloz:

```
NEXT_PUBLIC_SUPABASE_URL=https://ghodnzarypflppzzsmhm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdob2RuemFyeXBmbHBwenpzbWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDc2NDgsImV4cCI6MjA5MDIyMzY0OH0.G0qnQcPuvSC9PdiJslowuICaLKh3Aa4M5NLYwJYfM9U
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdob2RuemFyeXBmbHBwenpzbWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY0NzY0OCwiZXhwIjoyMDkwMjIzNjQ4fQ.cExRvsx4TYp8wDcjJ9BVyMjgD_IZtlQwPDL-AX9e3dY
ANTHROPIC_API_KEY=
```

ANTHROPIC_API_KEY doplnite pozdeji.

---

## 9. Spust dev server

```bash
bun run dev
```

Appka pobezi na http://localhost:3000

Prihlasovaci udaje:
- Email: matejkrejsa7@gmail.com
- Heslo: Ahoj12345!

---

## 10. Spust Claude Code

V novem terminalu (v adresari projektu):

```bash
cd ~/Desktop/LongNight1
claude
```

Ted muzes zadavat prikazy Claude Code a upravovat projekt.

---

## Jak funguje workflow

1. Upravis kod (rucne nebo pres Claude Code)
2. Commitnes zmeny: `git add . && git commit -m "popis zmeny"`
3. Pushnes na GitHub: `git push`
4. Vercel automaticky nasadi novou verzi na https://long-night1.vercel.app

### Pred praci vzdy stahni posledni zmeny:

```bash
git pull
```

---

## Dulezite

- **NIKDY** necommituj `.env.local` (obsahuje tajne klice)
- Vzdy pred praci udelej `git pull`
- Po praci udelej `git push`
- Appka je live na: https://long-night1.vercel.app
