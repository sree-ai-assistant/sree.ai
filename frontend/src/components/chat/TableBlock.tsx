import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Download, Maximize2, X, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiService } from '../../lib/api';
import { useUsageStore } from '../../store/usage.store';
import { useUIStore } from '../../store/ui.store';
import styles from './TableBlock.module.css';

interface TableBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export const TableBlock: React.FC<TableBlockProps> = ({ children, className }) => {
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showModalDownloadMenu, setShowModalDownloadMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [rowCount, setRowCount] = useState<number>(0);

  const tableRef = useRef<HTMLTableElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside clicks
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
      if (modalDropdownRef.current && !modalDropdownRef.current.contains(e.target as Node)) {
        setShowModalDownloadMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle modal keyboard escape & body scroll lock
  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  // Update row count
  useEffect(() => {
    if (tableRef.current) {
      const tbodyRows = tableRef.current.querySelectorAll('tbody tr');
      const allRows = tableRef.current.querySelectorAll('tr');
      setRowCount(tbodyRows.length > 0 ? tbodyRows.length : (allRows.length > 1 ? allRows.length - 1 : allRows.length));
    }
  }, [children, isExpanded]);

  // Extract structured row/column text from the rendered table
  const extractTableData = useCallback((): string[][] => {
    if (!tableRef.current) return [];
    const rows = Array.from(tableRef.current.querySelectorAll('tr'));
    return rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('th, td'));
      return cells.map(cell => (cell.textContent || '').trim());
    }).filter(row => row.length > 0);
  }, []);

  // Copy table as TSV (compatible with Excel, Sheets, Docs, and Markdown tables)
  const handleCopy = async () => {
    const data = extractTableData();
    if (data.length === 0) {
      toast.error('Table is empty');
      return;
    }

    const tsv = data.map(row => row.join('\t')).join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = tsv;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      toast.success('Table copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy table:', err);
      toast.error('Failed to copy table');
    }
  };

  // Download table as CSV or XLSX with credit deduction
  const handleDownload = async (format: 'csv' | 'xlsx') => {
    setShowDownloadMenu(false);
    setShowModalDownloadMenu(false);

    const data = extractTableData();
    if (data.length === 0) {
      toast.error('Table is empty');
      return;
    }

    setIsDownloading(true);
    try {
      // 1. Charge 1 download credit and verify limits via backend
      await aiService.trackDownload(format);

      // 2. Increment local usage store for instant counter updates
      useUsageStore.getState().incrementLocalUsage('download', 1);

      // 3. Generate file
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `table_${timestamp}_${Date.now()}`;

      if (format === 'csv') {
        const csvContent = data
          .map(row =>
            row
              .map(cell => {
                const escaped = cell.replace(/"/g, '""');
                return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')
                  ? `"${escaped}"`
                  : escaped;
              })
              .join(',')
          )
          .join('\r\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Downloaded table as CSV (1 credit used)');
      } else {
        // Dynamic import of xlsx for lightweight bundle
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'TableData');
        XLSX.writeFile(workbook, `${filename}.xlsx`);
        toast.success('Downloaded table as Excel (1 credit used)');
      }
    } catch (err: any) {
      console.error('Download error:', err);
      if (err?.response?.status === 429) {
        toast.error(err?.response?.data?.message || 'Download limit reached. Please upgrade your plan.');
        useUIStore.getState().openUpgradeModal('starter');
      } else if (err?.response?.status === 401) {
        toast.error('Please sign in to download tables.');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to download table.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className={`${styles.tableBlockContainer} ${className || ''}`}
      onMouseLeave={() => setShowDownloadMenu(false)}
    >
      <div className={styles.tableScrollWrapper}>
        <table ref={tableRef} className={styles.renderedTable}>
          {children}
        </table>
      </div>

      {/* Floating Action Toolbar on Hover */}
      <div className={`${styles.actionToolbar} ${showDownloadMenu ? styles.visible : ''}`}>
        <button
          type="button"
          className={`${styles.toolButton} ${copied ? styles.copied : ''}`}
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy table'}
          aria-label="Copy table"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>

        <div className={styles.downloadWrapper} ref={dropdownRef}>
          <button
            type="button"
            className={`${styles.toolButton} ${showDownloadMenu ? styles.active : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowDownloadMenu(prev => !prev);
            }}
            title="Download table"
            aria-label="Download table"
          >
            {isDownloading ? <Loader2 size={14} className={styles.spinner} /> : <Download size={14} />}
          </button>

          {showDownloadMenu && (
            <div className={styles.downloadDropdown}>
              <button
                type="button"
                className={styles.dropdownItem}
                onClick={() => handleDownload('csv')}
                disabled={isDownloading}
              >
                <span className={styles.itemLabel}>
                  <FileText size={14} />
                  <span>CSV File</span>
                </span>
                <span className={styles.badge}>.csv</span>
              </button>

              <button
                type="button"
                className={styles.dropdownItem}
                onClick={() => handleDownload('xlsx')}
                disabled={isDownloading}
              >
                <span className={styles.itemLabel}>
                  <FileSpreadsheet size={14} />
                  <span>Excel File</span>
                </span>
                <span className={styles.badge}>.xlsx</span>
              </button>

              <div className={styles.creditNote}>
                1 download credit charged
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.toolButton}
          onClick={() => setIsExpanded(true)}
          title="Expand table"
          aria-label="Expand table"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Full-view Modal via Portal */}
      {isExpanded && createPortal(
        <div className={styles.modalBackdrop} onClick={() => setIsExpanded(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3 className={styles.modalTitle}>Table</h3>
                {rowCount > 0 && (
                  <span className={styles.modalRowCount}>
                    {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                  </span>
                )}
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.modalIconButton} ${copied ? styles.copied : ''}`}
                  onClick={handleCopy}
                  title={copied ? 'Copied!' : 'Copy table'}
                  aria-label="Copy table"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>

                <div className={styles.downloadWrapper} ref={modalDropdownRef}>
                  <button
                    type="button"
                    className={`${styles.modalIconButton} ${showModalDownloadMenu ? styles.active : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModalDownloadMenu(prev => !prev);
                    }}
                    title="Download table"
                    aria-label="Download table"
                  >
                    {isDownloading ? <Loader2 size={15} className={styles.spinner} /> : <Download size={15} />}
                  </button>

                  {showModalDownloadMenu && (
                    <div className={styles.downloadDropdown} style={{ bottom: 'auto', top: 'calc(100% + 8px)' }}>
                      <button
                        type="button"
                        className={styles.dropdownItem}
                        onClick={() => handleDownload('csv')}
                        disabled={isDownloading}
                      >
                        <span className={styles.itemLabel}>
                          <FileText size={14} />
                          <span>CSV File</span>
                        </span>
                        <span className={styles.badge}>.csv</span>
                      </button>

                      <button
                        type="button"
                        className={styles.dropdownItem}
                        onClick={() => handleDownload('xlsx')}
                        disabled={isDownloading}
                      >
                        <span className={styles.itemLabel}>
                          <FileSpreadsheet size={14} />
                          <span>Excel File</span>
                        </span>
                        <span className={styles.badge}>.xlsx</span>
                      </button>

                      <div className={styles.creditNote}>
                        1 download credit charged
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setIsExpanded(false)}
                  title="Close"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              <table className={styles.renderedTable}>
                {children}
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
