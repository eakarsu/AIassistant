/**
 * Export data to CSV and trigger a file download.
 *
 * @param {string} filename - The name of the downloaded file (e.g. "patients.csv")
 * @param {Array<Object>} rows - Array of data objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 */
export function exportToCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) {
    alert('No data to export.');
    return;
  }

  const escapeCsvValue = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const header = columns.map(col => escapeCsvValue(col.label)).join(',');
  const body = rows.map(row =>
    columns.map(col => escapeCsvValue(row[col.key])).join(',')
  ).join('\n');

  const csvContent = header + '\n' + body;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default exportToCsv;
