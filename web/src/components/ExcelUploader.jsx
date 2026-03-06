import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import api from '../lib/api';

export default function ExcelUploader({ uploadUrl, requestedRole, onSuccess, templateUrl }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  const onDrop = useCallback((accepted) => {
    setResult(null); setError(null);
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      setPreview(rows.slice(0, 10));
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] }, multiple: false
  });

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append('file', file);
    form.append('requested_role', requestedRole);
    try {
      const { data } = await api.post(uploadUrl, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
      if (onSuccess) onSuccess(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed');
    } finally { setLoading(false); }
  };

  const columns = preview?.[0] ? Object.keys(preview[0]) : [];

  return (
    <div className="space-y-4">
      {templateUrl && (
        <div className="flex items-center gap-2">
          <a href={templateUrl} className="text-xs text-brand-primary underline flex items-center gap-1">
            📥 Download Excel Template
          </a>
        </div>
      )}

      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-primary bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
        <input {...getInputProps()} />
        <p className="text-2xl mb-2">📂</p>
        <p className="text-sm text-gray-600">{isDragActive ? 'Drop the file here...' : 'Drag & drop an Excel file, or click to select'}</p>
        <p className="text-xs text-gray-400 mt-1">.xlsx or .xls only · max 5MB</p>
        {file && <p className="text-xs text-brand-primary mt-2 font-medium">📄 {file.name}</p>}
      </div>

      {preview && preview.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Preview (first {preview.length} rows)</p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>{columns.map(c => <th key={c} className="px-3 py-2 text-left text-gray-500 font-medium">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {columns.map(c => <td key={c} className="px-3 py-1.5 text-gray-700 truncate max-w-32">{String(row[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleUpload} disabled={loading} className="mt-3 btn-primary w-full">
            {loading ? 'Uploading...' : `Upload & Register ${preview.length}+ Records`}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          <p className="font-semibold text-green-800 mb-1">Upload Complete</p>
          <p className="text-green-700">✓ Created: {result.created} &nbsp;|&nbsp; ⚠ Skipped: {result.skipped} &nbsp;|&nbsp; ✗ Errors: {result.errors_count}</p>
          {result.errors?.length > 0 && (
            <div className="mt-2 max-h-24 overflow-y-auto">
              {result.errors.map((e,i) => <p key={i} className="text-xs text-red-600">Row {e.row}: {e.error}</p>)}
            </div>
          )}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}
