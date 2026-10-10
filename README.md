# Dija – chat AI i pavarur (Netlify)

- public/index.html                  → faqja
- netlify/edge-functions/chat.js     → serveri i AI (çelësi qëndron këtu)
- netlify/edge-functions/search.js   → kërkimi nga Google (opsional)

## Vendosja
1. Ngarko të gjithë skedarët në një repository të ri në github.com.
2. Në app.netlify.com: Add new site → Import an existing project → GitHub → zgjidh repository-n → Deploy.
3. Site configuration → Environment variables → shto:
   - GROQ_API_KEY  (e detyrueshme, nga console.groq.com)
   - GOOGLE_API_KEY dhe GOOGLE_CX  (opsionale)
   - GROQ_MODEL  (opsionale, parazgjedhja openai/gpt-oss-120b)
   - DIJA_AUTO_SEARCH  (opsionale; vendose "always" që çdo pyetje të kërkohet në Google, përndryshe kërkon vetëm kur pyetja duket e re: viti 2024-2026, sot, lajme, çmime etj.)
   - GROQ_MAX_TOKENS  (opsionale, parazgjedhja 1000; rrite vetëm nëse ke plan më të lartë në Groq)
4. Deploys → Trigger deploy → Deploy site. Linku del si emri.netlify.app.

## Njohuritë deri në 2026
Modeli (gpt-oss) ka njohuri deri rreth 2024. Faqja tani i jep modelit datën e sotme dhe, nëse GOOGLE_API_KEY + GOOGLE_CX janë vendosur, kërkon automatikisht në Google për pyetjet e reja. Alternativë pa Google: vendos GROQ_MODEL = groq/compound-mini (ka kërkim interneti të integruar).
