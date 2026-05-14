const https = require('https');
const { parseAIJson } = require('../parseAIJson');

class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  async _makeRequest(messages) {
    const body = JSON.stringify({
      model: this.model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 2048,
    });

    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Radiology AI Assistant',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'OpenRouter API error'));
              return;
            }
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) {
              reject(new Error('No content in OpenRouter response'));
              return;
            }
            resolve(content);
          } catch (err) {
            reject(new Error(`Failed to parse OpenRouter response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`OpenRouter request failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async analyzeImage(imageDescription, bodyPart, modality) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert radiologist AI assistant specializing in medical image analysis. Provide detailed, structured radiology findings based on the image description provided. Always include:
1. Primary findings
2. Secondary/incidental findings
3. Measurements when applicable
4. Comparison with normal anatomy
5. Confidence level for each finding
Format your response as a JSON object with fields: findings (string), confidence_score (number 0-100), areas_of_interest (array of objects with region and description), recommendations (string).`
      },
      {
        role: 'user',
        content: `Analyze the following radiology image:
Modality: ${modality}
Body Part: ${bodyPart}
Image Description: ${imageDescription}

Provide a detailed radiological analysis with structured findings.`
      }
    ];

    const response = await this._makeRequest(messages);

    {
      const _p = parseAIJson(response);
      if (_p.ok) return _p.data;
    }

    return {
      findings: response,
      confidence_score: 75.0,
      areas_of_interest: [],
      recommendations: 'Please review AI-generated findings with clinical correlation.',
    };
  }

  async searchSimilarStudies(findings, modality, bodyPart) {
    const messages = [
      {
        role: 'system',
        content: `You are a radiology AI assistant that helps identify similar prior studies based on current findings. Given the current findings, suggest what types of prior studies would be relevant for comparison and what similarities to look for.
Format your response as a JSON object with fields: suggested_search_terms (array of strings), similar_conditions (array of objects with condition and relevance_score), comparison_points (array of strings), recommended_timeframe (string).`
      },
      {
        role: 'user',
        content: `Find similar studies for comparison:
Current Findings: ${findings}
Modality: ${modality}
Body Part: ${bodyPart}

Suggest similar prior studies and comparison points.`
      }
    ];

    const response = await this._makeRequest(messages);

    {
      const _p = parseAIJson(response);
      if (_p.ok) return _p.data;
    }

    return {
      suggested_search_terms: [modality, bodyPart],
      similar_conditions: [],
      comparison_points: [findings],
      recommended_timeframe: '12 months',
    };
  }

  async generateReport(patientInfo, findings, imageDetails) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert radiologist AI assistant that generates structured radiology reports following ACR reporting guidelines. Generate a complete, professional radiology report.
Format your response as a JSON object with fields: clinical_history (string), technique (string), findings (string), impression (string), recommendations (string), report_text (string - the complete formatted report).`
      },
      {
        role: 'user',
        content: `Generate a radiology report with the following information:

Patient Information:
${JSON.stringify(patientInfo, null, 2)}

Image Details:
${JSON.stringify(imageDetails, null, 2)}

Findings:
${findings}

Generate a complete, structured radiology report.`
      }
    ];

    const response = await this._makeRequest(messages);

    {
      const _p = parseAIJson(response);
      if (_p.ok) return _p.data;
    }

    return {
      clinical_history: patientInfo.medical_history || 'See clinical notes.',
      technique: `${imageDetails.modality} of the ${imageDetails.body_part} was performed.`,
      findings: findings,
      impression: 'Please review findings above.',
      recommendations: 'Clinical correlation recommended.',
      report_text: response,
    };
  }

  async draftImpression(findings) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert radiologist AI assistant. Given radiology findings, generate a concise radiological impression that summarizes the key findings in order of clinical significance. The impression should be clear, actionable, and follow standard radiology reporting conventions.
Format your response as a JSON object with fields: impression (string), key_findings (array of strings), urgency_level (string - one of: routine, urgent, emergent), follow_up_needed (boolean).`
      },
      {
        role: 'user',
        content: `Generate a radiological impression for the following findings:

${findings}

Provide a concise, clinically relevant impression.`
      }
    ];

    const response = await this._makeRequest(messages);

    {
      const _p = parseAIJson(response);
      if (_p.ok) return _p.data;
    }

    return {
      impression: response,
      key_findings: [],
      urgency_level: 'routine',
      follow_up_needed: false,
    };
  }
}

module.exports = new OpenRouterService();
