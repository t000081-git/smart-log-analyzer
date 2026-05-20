export type ThreatItem = {
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  evidence: string
}

export type AnalysisResult = {
  summary: string
  threats: ThreatItem[]
  recommendations: string
}

export async function callOpenRouter(
  logLines: string[],
  apiKey: string,
  model: string,
): Promise<AnalysisResult> {
  const joined = logLines.join('\n')

  const prompt = `You are a SOC analyst. Given the following log lines, produce STRICT JSON:
{
  "summary": "<2-4 sentence plain-English summary>",
  "threats": [
    {"severity": "low|medium|high|critical", "title": "...", "evidence": "<quote a line>"}
  ],
  "recommendations": "<bullet list as a single string>"
}

LOGS (one per line):
${joined}

Respond with JSON only. No prose, no markdown fences.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://smartlog-analyser.vercel.app',
      'X-Title': 'smart-log-analyzer',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = await res.json()
  const content: string = json.choices?.[0]?.message?.content ?? '{}'

  try {
    return JSON.parse(content) as AnalysisResult
  } catch {
    // Model returned non-JSON despite instructions; wrap it
    return {
      summary: content.slice(0, 500),
      threats: [],
      recommendations: '',
    }
  }
}
