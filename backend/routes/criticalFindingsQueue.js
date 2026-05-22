const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    summary: { flagged_studies: 9, unacknowledged: 3, avg_ack_minutes: 18, escalations: 2 },
    findings: [
      { study: 'CT-HEAD-8842', modality: 'CT', finding: 'possible acute hemorrhage', priority: 'critical', owner: 'Neuro Rad', status: 'awaiting acknowledgement' },
      { study: 'XR-CHEST-1190', modality: 'XR', finding: 'new pneumothorax', priority: 'urgent', owner: 'ER Rad', status: 'called' },
      { study: 'MRI-SPINE-2207', modality: 'MRI', finding: 'cord compression concern', priority: 'urgent', owner: 'MSK Rad', status: 'documented' },
    ],
  });
});

router.post('/acknowledge', (req, res) => {
  const { study = 'unknown', clinician = 'clinician' } = req.body || {};
  res.json({ study, clinician, status: 'acknowledged', timestamp: new Date().toISOString() });
});

module.exports = router;
