import React from 'react';

function DetailModal({ item, fields, onClose, onEdit, onDelete, title, children }) {
  if (!item) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return <span className="detail-value empty">Not specified</span>;
    }
    if (typeof value === 'boolean') {
      return value ? <span className="check-yes">{'\u2714'}</span> : <span className="check-no">{'\u2718'}</span>;
    }
    return <span className="detail-value">{String(value)}</span>;
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-card">
        <div className="modal-header">
          <h2>{title || 'Details'}</h2>
          <button className="modal-close" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          {fields.map(field => (
            <div key={field.key} className="detail-field">
              <div className="detail-label">{field.label}</div>
              {formatValue(item[field.key])}
            </div>
          ))}
          {children}
        </div>
        <div className="modal-footer">
          {onDelete && (
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(item)}>
              Delete
            </button>
          )}
          {onEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => onEdit(item)}>
              Edit
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DetailModal;
