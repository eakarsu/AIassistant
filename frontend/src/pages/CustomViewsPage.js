import React from 'react';
import Sidebar from '../components/Sidebar';
import ConversationTimeline from '../components/ConversationTimeline';
import IntentHeatmap from '../components/IntentHeatmap';
import TranscriptPdfExporter from '../components/TranscriptPdfExporter';
import PromptTemplateEditor from '../components/PromptTemplateEditor';

export default function CustomViewsPage() {
  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content" data-testid="custom-views-page">
        <div className="dashboard-header">
          <h1>Assistant Views</h1>
          <p>Custom visualizations and tooling for the General AI Assistant.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <ConversationTimeline />
          <IntentHeatmap />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
            <TranscriptPdfExporter />
            <PromptTemplateEditor />
          </div>
        </div>
      </div>
    </div>
  );
}
