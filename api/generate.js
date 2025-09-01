// api/generate.js
// نکته: نیازی به package.json و نصب پکیج نیست.
// اگر OPENAI_API_KEY ست نشده باشد، خروجی Mock می‌دهد تا همه‌چیز را سریع تست کنی.

module.exports = async (req, res) => {
  // اگر از دامنه‌ی دیگر صدا می‌زنی، این CORS ساده کمک می‌کنه. اگر همان دامنه است، اجباری نیست.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { inputs } = req.body || {};
    if (!inputs || !inputs.subjectTopic || !inputs.gradeAge || !Array.isArray(inputs.objectives)) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const methodName = (inputs.method || 'Teaching Method').trim();
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    // اگر کلید نداری، پاسخ آزمایشی برمی‌گردانیم تا Frontend را تست کنی
    if (!OPENAI_KEY) {
      const mock = buildMockPlan(methodName, inputs);
      return res.status(200).json(mock);
    }

    // درخواست به OpenAI (بدون نیاز به پکیج اضافه؛ با fetch داخلی Node)
    const system = `You are an expert instructional designer. 
Return ONLY valid JSON with this exact schema:
{
  "title": string,
  "description": string,
  "steps": [{"text": string, "time": string, "materials": string}],
  "application": string,
  "more": [{"label": string, "url": string, "download": boolean}]
}`;

    const user = {
      method: methodName,
      gradeAge: inputs.gradeAge,
      subjectTopic: inputs.subjectTopic,
      objectives: inputs.objectives,
      priorKnowledge: inputs.priorKnowledge || '',
      classProfile: inputs.classProfile || '',
      techAccess: inputs.techAccess || '',
      timeAvailable: inputs.timeAvailable || '',
      tone: inputs.tone || 'Friendly'
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Create a tailored, classroom-ready plan for:\n${JSON.stringify(user, null, 2)}` }
        ],
        temperature: 0.7
      })
    });

    if (!resp.ok) {
      const t = await resp.text().catch(()=> '');
      throw new Error(`OpenAI API error: ${resp.status} ${t}`);
    }

    const data = await resp.json();
    // پاسخ مدل را بخوان
    const content = data.choices?.[0]?.message?.content || '{}';

    // حتما JSON معتبر باشد
    let json;
    try { json = JSON.parse(content); }
    catch {
      // اگر مدل کمی اضافه گفت، سعی می‌کنیم JSON خالص را دربیاوریم
      const match = content.match(/\{[\s\S]*\}$/);
      json = match ? JSON.parse(match[0]) : null;
    }
    if (!json) throw new Error('Model did not return valid JSON.');

    // تضمین کمینه‌ی فیلدها
    json.title = json.title || `${user.subjectTopic} — ${user.gradeAge}`;
    if (!Array.isArray(json.steps) || !json.steps.length) {
      json.steps = [{ text: 'Introduce topic and objectives', time: '5 min', materials: 'Whiteboard' }];
    }
    json.application = json.application || 'Use this plan as a template and tweak timings.';
    if (!Array.isArray(json.more)) json.more = [];

    return res.status(200).json(json);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
};

function buildMockPlan(methodName, inputs) {
  const title = `${methodName} — ${inputs.subjectTopic} (${inputs.gradeAge})`;
  return {
    title,
    description: `A quick, structured ${methodName} plan tailored for ${inputs.gradeAge} on "${inputs.subjectTopic}".`,
    steps: [
      { text: 'Hook & objective sharing', time: '5 min', materials: 'Slides or board' },
      { text: `Mini-lesson aligned to objectives (${inputs.objectives.join('; ')})`, time: '10 min', materials: 'Examples' },
      { text: `${methodName}: students work in pairs/groups`, time: '20 min', materials: 'Worksheet/devices' },
      { text: 'Share-out & feedback', time: '7 min', materials: 'Timer' },
      { text: 'Exit ticket & next steps', time: '3 min', materials: 'Paper or form' }
    ],
    application: 'Use as a template; adjust time and difficulty for your class profile.',
    more: []
  };
}
