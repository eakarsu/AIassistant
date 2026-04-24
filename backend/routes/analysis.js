const express = require('express');
const pool = require('../db/pool');
const openRouterService = require('../services/openrouter');

const router = express.Router();

// GET /api/analyses
router.get('/', async (req, res) => {
  try {
    const { status, image_id, analysis_type, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT aa.*,
        ri.image_id as image_code, ri.modality, ri.body_part,
        r.name as reviewer_name
      FROM ai_analyses aa
      LEFT JOIN radiology_images ri ON aa.image_id = ri.id
      LEFT JOIN radiologists r ON aa.reviewed_by = r.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`aa.status = $${params.length}`);
    }
    if (image_id) {
      params.push(parseInt(image_id, 10));
      conditions.push(`aa.image_id = $${params.length}`);
    }
    if (analysis_type) {
      params.push(`%${analysis_type}%`);
      conditions.push(`aa.analysis_type ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY aa.created_at DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM ai_analyses aa WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM ai_analyses';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      analyses: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching analyses:', err);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

// GET /api/analyses/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT aa.*,
        ri.image_id as image_code, ri.modality, ri.body_part, ri.description as image_description,
        r.name as reviewer_name
      FROM ai_analyses aa
      LEFT JOIN radiology_images ri ON aa.image_id = ri.id
      LEFT JOIN radiologists r ON aa.reviewed_by = r.id
      WHERE aa.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching analysis:', err);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// POST /api/analyses
router.post('/', async (req, res) => {
  try {
    const {
      analysis_id, image_id, analysis_type, findings,
      confidence_score, areas_of_interest, ai_model, status,
      reviewed_by, review_notes
    } = req.body;

    if (!analysis_id || !image_id || !analysis_type) {
      return res.status(400).json({ error: 'analysis_id, image_id, and analysis_type are required' });
    }

    const result = await pool.query(
      `INSERT INTO ai_analyses (analysis_id, image_id, analysis_type, findings, confidence_score, areas_of_interest, ai_model, status, reviewed_by, review_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [analysis_id, image_id, analysis_type, findings, confidence_score, areas_of_interest ? JSON.stringify(areas_of_interest) : null, ai_model, status || 'pending', reviewed_by, review_notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Analysis with this ID already exists' });
    }
    console.error('Error creating analysis:', err);
    res.status(500).json({ error: 'Failed to create analysis' });
  }
});

// PUT /api/analyses/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      analysis_type, findings, confidence_score, areas_of_interest,
      ai_model, status, reviewed_by, review_notes
    } = req.body;

    const result = await pool.query(
      `UPDATE ai_analyses SET
        analysis_type = COALESCE($1, analysis_type),
        findings = COALESCE($2, findings),
        confidence_score = COALESCE($3, confidence_score),
        areas_of_interest = COALESCE($4, areas_of_interest),
        ai_model = COALESCE($5, ai_model),
        status = COALESCE($6, status),
        reviewed_by = COALESCE($7, reviewed_by),
        review_notes = COALESCE($8, review_notes),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [analysis_type, findings, confidence_score, areas_of_interest ? JSON.stringify(areas_of_interest) : null, ai_model, status, reviewed_by, review_notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating analysis:', err);
    res.status(500).json({ error: 'Failed to update analysis' });
  }
});

// DELETE /api/analyses/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM ai_analyses WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({ message: 'Analysis deleted successfully', analysis: result.rows[0] });
  } catch (err) {
    console.error('Error deleting analysis:', err);
    res.status(500).json({ error: 'Failed to delete analysis' });
  }
});

// POST /api/analyses/:id/run - Run AI analysis on an image
router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the analysis record
    const analysisResult = await pool.query('SELECT * FROM ai_analyses WHERE id = $1', [id]);
    if (analysisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const analysis = analysisResult.rows[0];

    // Get the associated image
    const imageResult = await pool.query('SELECT * FROM radiology_images WHERE id = $1', [analysis.image_id]);
    if (imageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Associated image not found' });
    }

    const image = imageResult.rows[0];

    // Update status to processing
    await pool.query(
      'UPDATE ai_analyses SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', id]
    );

    // Call OpenRouter AI service
    const aiResult = await openRouterService.analyzeImage(
      image.description || `${image.modality} of ${image.body_part}`,
      image.body_part,
      image.modality
    );

    // Update analysis with AI results
    const updatedAnalysis = await pool.query(
      `UPDATE ai_analyses SET
        findings = $1,
        confidence_score = $2,
        areas_of_interest = $3,
        ai_model = $4,
        status = 'completed',
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        aiResult.findings || JSON.stringify(aiResult),
        aiResult.confidence_score || 75.0,
        JSON.stringify(aiResult.areas_of_interest || []),
        process.env.OPENROUTER_MODEL,
        id,
      ]
    );

    // Update image status
    await pool.query(
      'UPDATE radiology_images SET status = $1, updated_at = NOW() WHERE id = $2',
      ['analyzed', image.id]
    );

    res.json({
      message: 'AI analysis completed successfully',
      analysis: updatedAnalysis.rows[0],
      ai_result: aiResult,
    });
  } catch (err) {
    // Revert status on failure
    await pool.query(
      'UPDATE ai_analyses SET status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', req.params.id]
    ).catch(() => {});

    console.error('Error running AI analysis:', err);
    res.status(500).json({ error: 'Failed to run AI analysis', details: err.message });
  }
});

// POST /api/analyses/search-similar - Search for similar studies using AI
router.post('/search-similar', async (req, res) => {
  try {
    const { findings, modality, body_part } = req.body;

    if (!findings) {
      return res.status(400).json({ error: 'findings are required' });
    }

    // Call OpenRouter AI for similar study suggestions
    const aiSuggestions = await openRouterService.searchSimilarStudies(
      findings,
      modality || 'any',
      body_part || 'any'
    );

    // Also search the database for potentially matching prior studies
    let dbQuery = 'SELECT * FROM prior_studies WHERE 1=1';
    const params = [];

    if (modality) {
      params.push(modality);
      dbQuery += ` AND modality = $${params.length}`;
    }
    if (body_part) {
      params.push(`%${body_part}%`);
      dbQuery += ` AND body_part ILIKE $${params.length}`;
    }

    dbQuery += ' ORDER BY study_date DESC LIMIT 20';

    const dbResult = await pool.query(dbQuery, params);

    res.json({
      ai_suggestions: aiSuggestions,
      matching_studies: dbResult.rows,
    });
  } catch (err) {
    console.error('Error searching similar studies:', err);
    res.status(500).json({ error: 'Failed to search similar studies', details: err.message });
  }
});

module.exports = router;
