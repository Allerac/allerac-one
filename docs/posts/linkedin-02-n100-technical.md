# LinkedIn Post #2 — Technical Deep Dive: LLM on N100

**Theme:** Technical authority — how to run a 7B LLM on a €150 mini PC
**Best time to post:** Tuesday or Thursday, 8–10h or 17–19h
**Format:** Text + screenshot of token speed / htop showing RAM usage
**Post after:** 3–5 days after post #1

---

## 🇧🇷 Portuguese version

---

Como correr um modelo de linguagem de 7B parâmetros num processador de €150?

Aqui está o que aprendi a testar o Allerac num Intel N100.

O N100 tem 4 núcleos, consome 6W em idle e 30W em carga. Não tem GPU dedicada. À primeira vista, parece hardware a menos para IA.

Mas há um truque: **quantização**.

Um modelo Qwen 2.5 7B completo pesa ~14GB. A versão quantizada em 4-bit (Q4_K_M) pesa ~4.5GB e cabe na RAM do N100 com espaço a sobrar. A perda de qualidade é praticamente imperceptível numa conversa normal.

**Resultados reais no N100 com 16GB RAM:**

| Modelo | Tamanho | Velocidade |
|--------|---------|------------|
| qwen2.5:3b (Q4) | 2.0 GB | ~12 tok/s |
| qwen2.5:7b (Q4) | 4.5 GB | ~6 tok/s |
| deepseek-r1:7b (Q4) | 4.7 GB | ~5 tok/s |

6 tokens por segundo pode parecer lento. Na prática, é rápido o suficiente para uma conversa fluida — o ChatGPT gratuito às vezes é mais lento.

**O que o N100 faz bem:**
→ Assistente pessoal 24/7 (consumo mínimo)
→ Processar documentos em background
→ Responder perguntas, rascunhar textos, analisar dados
→ Correr enquanto dormes sem sentir na fatura da luz (~€3/mês)

**O que não faz bem:**
→ Modelos acima de 7B (precisa de mais RAM)
→ Respostas de raciocínio longo (thinking models ficam lentos)
→ Múltiplos utilizadores simultâneos

Para isso, o i5/32GB já resolve.

A conclusão que tirei: para uso pessoal diário, o N100 é suficiente. E o facto de estar sempre ligado, sempre disponível, sem nenhuma subscrição — muda completamente a relação com a ferramenta.

O código está em: github.com/allerac/allerac-one
Instalação: `curl -sSL https://get.allerac.ai | bash`

Alguma pergunta técnica? Respondo nos comentários.

#LocalAI #LLM #IntelN100 #Ollama #PrivateAI #OpenSource #BuildInPublic

---

## 🇬🇧 English version

---

How do you run a 7B parameter language model on a €150 processor?

Here's what I learned testing Allerac on an Intel N100.

The N100 has 4 cores, uses 6W idle and 30W under load. No dedicated GPU. On paper, it looks underpowered for AI.

But there's a trick: **quantization**.

A full Qwen 2.5 7B model weighs ~14GB. The 4-bit quantized version (Q4_K_M) weighs ~4.5GB and fits in the N100's RAM with room to spare. The quality loss is nearly imperceptible in everyday conversation.

**Real results on N100 with 16GB RAM:**

| Model | Size | Speed |
|-------|------|-------|
| qwen2.5:3b (Q4) | 2.0 GB | ~12 tok/s |
| qwen2.5:7b (Q4) | 4.5 GB | ~6 tok/s |
| deepseek-r1:7b (Q4) | 4.7 GB | ~5 tok/s |

6 tokens/second might sound slow. In practice, it's fast enough for a fluid conversation — free ChatGPT is sometimes slower.

**What the N100 does well:**
→ 24/7 personal assistant (minimal power draw)
→ Processing documents in the background
→ Answering questions, drafting text, analyzing data
→ Running while you sleep without impacting your electricity bill (~€3/month)

**What it doesn't do well:**
→ Models above 7B (needs more RAM)
→ Long reasoning chains (thinking models get slow)
→ Multiple simultaneous users

For that, an i5/32GB already solves it.

My conclusion: for daily personal use, the N100 is enough. And the fact that it's always on, always available, with no subscription — completely changes your relationship with the tool.

Code: github.com/allerac/allerac-one
Install: `curl -sSL https://get.allerac.ai | bash`

Technical questions? I'll answer in the comments.

#LocalAI #LLM #IntelN100 #Ollama #PrivateAI #OpenSource #BuildInPublic #SelfHosted

---

## Notes for posting

- **Image:** Screenshot of `htop` showing RAM usage while running the model, or a terminal with token generation speed visible
- **Alternative image:** Side-by-side comparison table (you vs ChatGPT response speed)
- **First comment:** GitHub link + install command
- **Engage:** Reply to every comment in the first hour — the algorithm rewards early engagement velocity
