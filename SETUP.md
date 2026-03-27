# Long Night — Setup pro Mateje (krok po kroku)

Kompletni navod jak rozjet projekt. Vse pres klikani, zadny terminal dokud to neni nutne.

---

## KROK 1: Stahni a nainstaluj programy

Otevri tyto 4 odkazy a vsechno stahni a nainstaluj (vzdy klikni na "Download" / "Install"):

### a) Node.js
- Jdi na: https://nodejs.org/
- Klikni na velke zelene tlacitko "Download Node.js (LTS)"
- Otevri stazeny soubor a proklikej instalaci (Next, Next, Install, Finish)

### b) Bun
- Jdi na: https://bun.sh/
- Klikni "Install" — na Windows stahne installer, na Mac stahne pkg
- Proklikej instalaci

### c) Git
- Jdi na: https://git-scm.com/downloads
- Vyber svuj system (Windows / Mac)
- Stahni a nainstaluj (vsechno nech na vychozich hodnotach, jen klikej Next)

### d) GitHub Desktop
- Jdi na: https://desktop.github.com/
- Stahni a nainstaluj
- Po spusteni se prihlas svym GitHub uctem (pokud nemas, vytvor si ho na github.com)

### e) Claude Code
- Jdi na: https://claude.ai/download
- Stahni Claude for Desktop
- Po instalaci otevri aplikaci a prihlas se (potrebujes Claude Max plan)

---

## KROK 2: Jakub te prida do repa

Jakub musi udelat tohle:
1. Jit na https://github.com/liftykreatincz/LongNight1/settings/access
2. Kliknout "Add people"
3. Zadat tvuj GitHub email nebo username
4. Ty pak dostanes email s pozvankou — klikni "Accept"

---

## KROK 3: Naklonuj projekt pres GitHub Desktop

1. Otevri **GitHub Desktop**
2. Klikni **File > Clone Repository**
3. Vyber zalocku **URL**
4. Vloz: `https://github.com/liftykreatincz/LongNight1.git`
5. Local Path vyber kam chces ulozit (napr. Desktop)
6. Klikni **Clone**

Projekt se stahne na tvuj pocitac.

---

## KROK 4: Otevri terminal ve slozce projektu

### Na Mac:
1. Otevri **Terminal** (Finder > Applications > Utilities > Terminal)
2. Napis `cd ` (cd a mezera) a pak pretahni slozku LongNight1 z Finderu do terminalu
3. Stiskni Enter

### Na Windows:
1. Otevri slozku LongNight1 v Przkumniku
2. Klikni do adresniho radku nahore
3. Napis `cmd` a stiskni Enter (otevre se terminal v te slozce)

### Nebo v GitHub Desktop:
- Klikni **Repository > Open in Terminal**

---

## KROK 5: Nainstaluj zavislosti

V terminalu (ve slozce projektu) napis:

```
bun install
```

Pocekej az se vse nainstaluje.

---

## KROK 6: Vytvor soubor .env.local

1. Ve slozce projektu (LongNight1) vytvor novy textovy soubor
2. Pojmenuj ho presne: `.env.local` (vcetne tecky na zacatku)
3. Otevri ho v Poznamkovem bloku / TextEdit a vloz tento text:

```
NEXT_PUBLIC_SUPABASE_URL=https://ghodnzarypflppzzsmhm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdob2RuemFyeXBmbHBwenpzbWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDc2NDgsImV4cCI6MjA5MDIyMzY0OH0.G0qnQcPuvSC9PdiJslowuICaLKh3Aa4M5NLYwJYfM9U
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdob2RuemFyeXBmbHBwenpzbWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY0NzY0OCwiZXhwIjoyMDkwMjIzNjQ4fQ.cExRvsx4TYp8wDcjJ9BVyMjgD_IZtlQwPDL-AX9e3dY
ANTHROPIC_API_KEY=
```

4. Uloz soubor

**TIP pro Windows:** Pokud nevidis soubory zacinajici teckou, zapni v Pruzkumniku "Zobrazit > Skryte polozky"

**TIP pro Mac TextEdit:** Pouzij Format > Make Plain Text pred ulozenim

---

## KROK 7: Spust appku lokalne

V terminalu (ve slozce projektu):

```
bun run dev
```

Otevri prohlizec a jdi na: **http://localhost:3000**

Prihlasovaci udaje:
- **Email:** matejkrejsa7@gmail.com
- **Heslo:** Ahoj12345!

---

## KROK 8: Spust Claude Code

1. Otevri novy terminal (nech ten prvni bezet)
2. Prejdi do slozky projektu (stejne jako v Kroku 4)
3. Napis:

```
claude
```

4. Claude Code se spusti a muzes mu zadavat ukoly ("uprav tuto stranku", "pridej tlacitko" atd.)

---

## Jak ukladat zmeny (pres GitHub Desktop)

1. Po uprave kodu otevri **GitHub Desktop**
2. Vlevo uvidis zmenene soubory
3. Dole napis kratky popis co jsi zmenil (napr. "upravil login stranku")
4. Klikni **Commit to main**
5. Klikni **Push origin** (nahore)
6. Vercel automaticky nasadi novou verzi behem par minut

### DULEZITE: Pred praci vzdy klikni "Fetch origin" / "Pull" v GitHub Desktop — stahne posledni zmeny od Jakuba.

---

## Appka je live na

https://long-night1.vercel.app

---

## Prihlasovaci udaje do appky

| Kdo | Email | Heslo |
|-----|-------|-------|
| Jakub | business@lifty.cz | Ahoj12345! |
| Matej | matejkrejsa7@gmail.com | Ahoj12345! |
