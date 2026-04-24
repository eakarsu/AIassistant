import React from 'react';

function AIOutput({ data, type, isLoading }) {
  if (isLoading) {
    return (
      <div className="ai-output">
        <div className="ai-generating">
          <div className="ai-generating-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="ai-generating-text">AI is analyzing...</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const getConfidenceClass = (score) => {
    const num = typeof score === 'string' ? parseFloat(score) : score;
    if (num >= 0.8) return 'high';
    if (num >= 0.5) return 'medium';
    return 'low';
  };

  const getConfidencePercent = (score) => {
    const num = typeof score === 'string' ? parseFloat(score) : score;
    if (num > 1) return num;
    return Math.round(num * 100);
  };

  const parseSections = (text) => {
    if (!text || typeof text !== 'string') return [];
    const sections = [];
    const lines = text.split('\n');
    let currentSection = { title: '', content: '' };

    lines.forEach(line => {
      const trimmed = line.trim();
      const headerMatch = trimmed.match(/^(?:#{1,3}\s+)?(?:\*\*)?([A-Z][A-Za-z\s/]+):?\s*(?:\*\*)?$/);
      if (headerMatch || trimmed.match(/^(?:CLINICAL HISTORY|TECHNIQUE|FINDINGS|IMPRESSION|RECOMMENDATIONS|CONCLUSION|SUMMARY|AREAS OF INTEREST|DIAGNOSIS|COMPARISON)[:.]?\s*$/i)) {
        if (currentSection.title || currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }
        currentSection = { title: (headerMatch ? headerMatch[1] : trimmed.replace(/[:#*]/g, '')).trim(), content: '' };
      } else {
        currentSection.content += line + '\n';
      }
    });

    if (currentSection.title || currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return sections;
  };

  const highlightKeyTerms = (text) => {
    if (!text) return '';
    const terms = [
      'mass', 'lesion', 'nodule', 'fracture', 'opacity', 'effusion',
      'cardiomegaly', 'pneumothorax', 'consolidation', 'atelectasis',
      'edema', 'normal', 'abnormal', 'suspicious', 'malignant', 'benign',
      'stenosis', 'occlusion', 'hemorrhage', 'infarct', 'tumor',
      'metastasis', 'calcification', 'inflammation', 'no significant',
      'within normal limits', 'unremarkable', 'stable'
    ];
    let result = text;
    terms.forEach(term => {
      const regex = new RegExp(`\\b(${term})\\b`, 'gi');
      result = result.replace(regex, '<span class="ai-highlight">$1</span>');
    });
    return result;
  };

  const renderAnalysis = () => {
    const findings = data.findings || data.results?.findings || data.analysis?.findings;
    const confidence = data.confidence_score || data.confidence || data.results?.confidence_score;
    const areasOfInterest = data.areas_of_interest || data.results?.areas_of_interest || [];
    const rawText = data.results || data.output || data.analysis;

    return (
      <>
        {confidence !== undefined && (
          <div className="ai-section">
            <div className="ai-section-title">Confidence Score</div>
            <div className="confidence-bar-container">
              <div className="confidence-bar">
                <div
                  className={`confidence-bar-fill ${getConfidenceClass(confidence)}`}
                  style={{ width: `${getConfidencePercent(confidence)}%` }}
                />
              </div>
              <span className={`confidence-label ${getConfidenceClass(confidence)}`}>
                {getConfidencePercent(confidence)}%
              </span>
            </div>
          </div>
        )}

        {findings && (
          <div className="ai-section">
            <div className="ai-section-title">Findings</div>
            {typeof findings === 'string' ? (
              <div
                className="ai-section-content"
                dangerouslySetInnerHTML={{ __html: highlightKeyTerms(findings) }}
              />
            ) : Array.isArray(findings) ? (
              findings.map((f, i) => (
                <div key={i} className="ai-finding-card">
                  <div className="ai-finding-title">{f.title || f.name || f.type || `Finding ${i + 1}`}</div>
                  <div className="ai-finding-text">{f.description || f.text || f.detail || JSON.stringify(f)}</div>
                  {f.confidence !== undefined && (
                    <div className="confidence-bar-container">
                      <div className="confidence-bar">
                        <div
                          className={`confidence-bar-fill ${getConfidenceClass(f.confidence)}`}
                          style={{ width: `${getConfidencePercent(f.confidence)}%` }}
                        />
                      </div>
                      <span className={`confidence-label ${getConfidenceClass(f.confidence)}`}>
                        {getConfidencePercent(f.confidence)}%
                      </span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="ai-section-content">{JSON.stringify(findings, null, 2)}</div>
            )}
          </div>
        )}

        {Array.isArray(areasOfInterest) && areasOfInterest.length > 0 && (
          <div className="ai-section">
            <div className="ai-section-title">Areas of Interest</div>
            {areasOfInterest.map((area, i) => (
              <div key={i} className="ai-finding-card">
                <div className="ai-finding-title">{area.region || area.area || area.name || `Area ${i + 1}`}</div>
                <div className="ai-finding-text">{area.description || area.finding || JSON.stringify(area)}</div>
              </div>
            ))}
          </div>
        )}

        {typeof rawText === 'string' && !findings && (
          <div className="ai-section">
            <div className="ai-section-title">Analysis Results</div>
            <div
              className="ai-section-content"
              dangerouslySetInnerHTML={{ __html: highlightKeyTerms(rawText) }}
            />
          </div>
        )}
      </>
    );
  };

  const renderReport = () => {
    const report = data.report || data.draft || data.results || data;
    let textContent = '';

    if (typeof report === 'string') {
      textContent = report;
    } else if (report.content) {
      textContent = report.content;
    } else if (report.text) {
      textContent = report.text;
    }

    const expectedSections = ['clinical_history', 'technique', 'findings', 'impression', 'recommendations'];
    const hasStructuredFields = expectedSections.some(s => report[s] || data[s]);

    if (hasStructuredFields) {
      return (
        <>
          {expectedSections.map(section => {
            const value = report[section] || data[section];
            if (!value) return null;
            const title = section.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return (
              <div key={section} className="ai-section">
                <div className="ai-section-title">{title}</div>
                <div
                  className="ai-section-content"
                  dangerouslySetInnerHTML={{ __html: highlightKeyTerms(String(value)) }}
                />
              </div>
            );
          })}
        </>
      );
    }

    if (textContent) {
      const sections = parseSections(textContent);
      if (sections.length > 1) {
        return sections.map((section, i) => (
          <div key={i} className="ai-section">
            {section.title && <div className="ai-section-title">{section.title}</div>}
            <div
              className="ai-section-content"
              dangerouslySetInnerHTML={{ __html: highlightKeyTerms(section.content.trim()) }}
            />
          </div>
        ));
      }
      return (
        <div className="ai-section">
          <div className="ai-section-title">Generated Report</div>
          <div
            className="ai-section-content"
            dangerouslySetInnerHTML={{ __html: highlightKeyTerms(textContent) }}
          />
        </div>
      );
    }

    return (
      <div className="ai-section">
        <div className="ai-section-title">Report Content</div>
        <div className="ai-section-content">{JSON.stringify(report, null, 2)}</div>
      </div>
    );
  };

  const renderSearch = () => {
    const results = data.results || data.similar_studies || data.matches || data;
    const items = Array.isArray(results) ? results : (results.studies || results.matches || []);

    if (items.length === 0 && typeof results === 'string') {
      return (
        <div className="ai-section">
          <div className="ai-section-title">Search Results</div>
          <div className="ai-section-content">{results}</div>
        </div>
      );
    }

    return (
      <div className="ai-section">
        <div className="ai-section-title">Similar Studies Found ({items.length})</div>
        {items.length === 0 ? (
          <div className="ai-section-content text-muted">No similar studies found matching your criteria.</div>
        ) : (
          items.map((study, i) => (
            <div key={i} className="ai-similar-card">
              <div className="ai-similar-header">
                <span className="ai-similar-title">
                  {study.title || study.study_id || study.diagnosis || `Study ${i + 1}`}
                </span>
                {(study.similarity || study.similarity_score || study.score) && (
                  <span className="ai-similarity-badge">
                    {getConfidencePercent(study.similarity || study.similarity_score || study.score)}% Match
                  </span>
                )}
              </div>
              <div className="ai-similar-detail">
                {study.modality && <div><strong>Modality:</strong> {study.modality}</div>}
                {study.body_part && <div><strong>Body Part:</strong> {study.body_part}</div>}
                {study.findings && <div><strong>Findings:</strong> {study.findings}</div>}
                {study.diagnosis && <div><strong>Diagnosis:</strong> {study.diagnosis}</div>}
                {study.description && <div>{study.description}</div>}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderImpression = () => {
    const impression = data.impression || data.text || data.content || data;
    const text = typeof impression === 'string' ? impression : JSON.stringify(impression, null, 2);

    return (
      <div className="ai-section">
        <div className="ai-section-title">Impression</div>
        <div
          className="ai-section-content"
          dangerouslySetInnerHTML={{ __html: highlightKeyTerms(text) }}
        />
      </div>
    );
  };

  const renderContent = () => {
    switch (type) {
      case 'analysis': return renderAnalysis();
      case 'report': return renderReport();
      case 'search': return renderSearch();
      case 'impression': return renderImpression();
      default: return renderAnalysis();
    }
  };

  const model = data.model || data.ai_model || data.results?.model || 'AI Engine';
  const timestamp = data.timestamp || data.created_at || data.analyzed_at || new Date().toISOString();

  const typeLabel = {
    analysis: 'AI Analysis Results',
    report: 'AI Generated Report',
    search: 'Similar Study Search',
    impression: 'AI Impression',
  };

  return (
    <div className="ai-output">
      <div className="ai-output-header">
        <h3>
          {'\uD83E\uDDE0'} {typeLabel[type] || 'AI Output'}
        </h3>
        <div className="ai-output-meta">
          <span>Model: {model}</span>
          <span>{new Date(timestamp).toLocaleString()}</span>
        </div>
      </div>
      {renderContent()}
    </div>
  );
}

export default AIOutput;
