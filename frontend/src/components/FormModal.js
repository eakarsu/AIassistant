import React, { useState, useEffect } from 'react';

function FormModal({ item, fields, onClose, onSave, title }) {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const initial = {};
    fields.forEach(field => {
      if (item && item[field.key] !== undefined && item[field.key] !== null) {
        initial[field.key] = item[field.key];
      } else {
        initial[field.key] = '';
      }
    });
    setFormData(initial);
  }, [item, fields]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    fields.forEach(field => {
      if (field.required && (!formData[field.key] || String(formData[field.key]).trim() === '')) {
        newErrors[field.key] = `${field.label} is required`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const cleaned = { ...formData };
    fields.forEach(field => {
      if (field.type === 'number' && cleaned[field.key] !== '') {
        cleaned[field.key] = Number(cleaned[field.key]);
      }
    });

    onSave(cleaned);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const renderInput = (field) => {
    const value = formData[field.key] !== undefined ? formData[field.key] : '';

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={e => handleChange(field.key, e.target.value)}
        >
          <option value="">Select {field.label}</option>
          {(field.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={e => handleChange(field.key, e.target.value)}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          rows={3}
        />
      );
    }

    return (
      <input
        type={field.type || 'text'}
        value={value}
        onChange={e => handleChange(field.key, e.target.value)}
        placeholder={`Enter ${field.label.toLowerCase()}`}
      />
    );
  };

  const isFullWidth = (field) => {
    return field.type === 'textarea';
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-card">
        <div className="modal-header">
          <h2>{title || (item ? 'Edit' : 'Create New')}</h2>
          <button className="modal-close" onClick={onClose}>{'\u2715'}</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              {fields.map(field => (
                <div
                  key={field.key}
                  className={`form-group ${isFullWidth(field) ? 'full-width' : ''}`}
                >
                  <label>
                    {field.label}
                    {field.required && <span className="required">*</span>}
                  </label>
                  {renderInput(field)}
                  {errors[field.key] && (
                    <span className="form-error">{errors[field.key]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              {item ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FormModal;
